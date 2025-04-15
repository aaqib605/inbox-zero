import type { gmail_v1 } from "@googleapis/gmail";
import { parseMessage } from "@/utils/mail";
import {
  type BatchError,
  type MessageWithPayload,
  type ParsedMessage,
  isBatchError,
  isDefined,
} from "@/utils/types";
import { getBatch } from "@/utils/gmail/batch";
import { extractDomainFromEmail } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("gmail/message");

export async function getMessage(
  messageId: string,
  gmail: gmail_v1.Gmail,
  format?: "full" | "metadata",
): Promise<MessageWithPayload> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format,
  });

  return message.data as MessageWithPayload;
}

export async function getMessageByRfc822Id(
  rfc822MessageId: string,
  gmail: gmail_v1.Gmail,
) {
  // Search for message using RFC822 Message-ID header
  // Remove any < > brackets if present
  const cleanMessageId = rfc822MessageId.replace(/[<>]/g, "");

  const response = await gmail.users.messages.list({
    userId: "me",
    q: `rfc822msgid:${cleanMessageId}`,
    maxResults: 1,
  });

  const message = response.data.messages?.[0];
  if (!message?.id) {
    logger.error("No message found for RFC822 Message-ID", {
      rfc822MessageId,
    });
    return null;
  }

  return getMessage(message.id, gmail);
}

export async function getMessagesBatch(
  messageIds: string[],
  accessToken: string,
  retryCount = 0,
): Promise<ParsedMessage[]> {
  if (retryCount > 3) {
    logger.error("Too many retries", { messageIds, retryCount });
    return [];
  }
  if (messageIds.length > 100) throw new Error("Too many messages. Max 1000");

  const batch: (MessageWithPayload | BatchError)[] = await getBatch(
    messageIds,
    "/gmail/v1/users/me/messages",
    accessToken,
  );

  const missingMessageIds = new Set<string>();

  const messages = batch
    .map((message, i) => {
      if (isBatchError(message)) {
        logger.error("Error fetching message", {
          code: message.error.code,
          error: message.error.message,
        });
        missingMessageIds.add(messageIds[i]);
        return;
      }

      return parseMessage(message as MessageWithPayload);
    })
    .filter(isDefined);

  // if we errored, then try to refetch the missing messages
  if (missingMessageIds.size > 0) {
    logger.info("Missing messages", {
      missingMessageIds: Array.from(missingMessageIds),
    });
    const nextRetryCount = retryCount + 1;
    await sleep(1_000 * nextRetryCount);
    const missingMessages = await getMessagesBatch(
      Array.from(missingMessageIds),
      accessToken,
      nextRetryCount,
    );
    return [...messages, ...missingMessages];
  }

  return messages;
}

async function findPreviousEmailsWithSender(
  gmail: gmail_v1.Gmail,
  options: {
    sender: string;
    dateInSeconds: number;
  },
) {
  // Check for both incoming emails from sender and outgoing emails to sender
  const [incomingEmails, outgoingEmails] = await Promise.all([
    // Incoming
    gmail.users.messages.list({
      userId: "me",
      q: `from:${options.sender} before:${options.dateInSeconds}`,
      maxResults: 2,
    }),
    // Outgoing
    gmail.users.messages.list({
      userId: "me",
      q: `to:${options.sender} before:${options.dateInSeconds}`,
      maxResults: 1,
    }),
  ]);

  // Combine both incoming and outgoing messages
  const allMessages = [
    ...(incomingEmails.data.messages || []),
    ...(outgoingEmails.data.messages || []),
  ];

  return allMessages;
}

export async function hasPreviousCommunicationWithSender(
  gmail: gmail_v1.Gmail,
  options: { from: string; date: Date; messageId: string },
) {
  const previousEmails = await findPreviousEmailsWithSender(gmail, {
    sender: options.from,
    dateInSeconds: +new Date(options.date) / 1000,
  });
  // Ignore the current email
  const hasPreviousEmail = !!previousEmails?.find(
    (p) => p.id !== options.messageId,
  );

  return hasPreviousEmail;
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "@me.com",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
  "gmx.com",
  "@hey.com",
]);

export async function hasPreviousCommunicationsWithSenderOrDomain(
  gmail: gmail_v1.Gmail,
  options: { from: string; date: Date; messageId: string },
) {
  const domain = extractDomainFromEmail(options.from);
  if (!domain) return hasPreviousCommunicationWithSender(gmail, options);

  // For public email providers (gmail, yahoo, etc), search by full email address
  // For company domains, search by domain to catch emails from different people at same company
  const searchTerm = PUBLIC_DOMAINS.has(domain.toLowerCase())
    ? options.from
    : domain;

  return hasPreviousCommunicationWithSender(gmail, {
    ...options,
    from: searchTerm,
  });
}

export async function getMessages(
  gmail: gmail_v1.Gmail,
  options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
  },
) {
  const messages = await gmail.users.messages.list({
    userId: "me",
    maxResults: options.maxResults,
    q: options.query,
    pageToken: options.pageToken,
    labelIds: options.labelIds,
  });

  return messages.data;
}

export async function queryBatchMessages(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  {
    query,
    maxResults = 20,
    pageToken,
  }: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  },
) {
  if (maxResults > 20) {
    throw new Error(
      "Max results must be 20 or Google will rate limit us and return 429 errors.",
    );
  }

  const messages = await getMessages(gmail, { query, maxResults, pageToken });
  if (!messages.messages) return { messages: [], nextPageToken: undefined };
  const messageIds = messages.messages.map((m) => m.id).filter(isDefined);
  return {
    messages: (await getMessagesBatch(messageIds, accessToken)) || [],
    nextPageToken: messages.nextPageToken,
  };
}

// loops through multiple pages of messages
export async function queryBatchMessagesPages(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  {
    query,
    maxResults,
  }: {
    query: string;
    maxResults: number;
  },
) {
  const messages: ParsedMessage[] = [];
  let nextPageToken: string | undefined;
  do {
    const { messages: pageMessages, nextPageToken: nextToken } =
      await queryBatchMessages(gmail, accessToken, {
        query,
        pageToken: nextPageToken,
      });
    messages.push(...pageMessages);
    nextPageToken = nextToken || undefined;
  } while (nextPageToken && messages.length < maxResults);

  return messages;
}
