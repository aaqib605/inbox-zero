"use client";

import type React from "react";
import clsx from "clsx";
import Link from "next/link";
import useSWR from "swr";
import type { gmail_v1 } from "googleapis";
import {
  ArchiveIcon,
  ArchiveXIcon,
  BadgeCheckIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExpandIcon,
  ExternalLinkIcon,
  MailMinusIcon,
  MoreHorizontalIcon,
  PlusCircle,
  TagIcon,
  TrashIcon,
  UserPlus,
} from "lucide-react";
import { type PostHog, usePostHog } from "posthog-js/react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Tooltip } from "@/components/Tooltip";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import {
  PremiumTooltip,
  PremiumTooltipContent,
} from "@/components/PremiumAlert";
import { NewsletterStatus } from "@prisma/client";
import { cleanUnsubscribeLink } from "@/utils/parse/parseHtml.client";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { addGroupItemAction } from "@/utils/actions/group";
import { toastError, toastSuccess } from "@/components/Toast";
import { createFilterAction } from "@/utils/actions/mail";
import { isActionError, isErrorMessage } from "@/utils/error";
import { getGmailSearchUrl } from "@/utils/url";
import type { Row } from "@/app/(app)/bulk-unsubscribe/types";
import {
  useUnsubscribe,
  useAutoArchive,
  useApproveButton,
  useArchiveAll,
  useDeleteAllFromSender,
} from "@/app/(app)/bulk-unsubscribe/hooks";

export function ActionCell<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  refetchPremium,
  onOpenNewsletter,
  userGmailLabels,
  openPremiumModal,
  userEmail,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  refetchPremium: () => Promise<any>;
  onOpenNewsletter: (row: T) => void;
  selected: boolean;
  userGmailLabels: LabelsResponse["labels"];
  openPremiumModal: () => void;
  userEmail: string;
}) {
  const posthog = usePostHog();

  return (
    <>
      <PremiumTooltip
        showTooltip={!hasUnsubscribeAccess}
        openModal={openPremiumModal}
      >
        <UnsubscribeButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
          refetchPremium={refetchPremium}
        />
      </PremiumTooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? (
            <PremiumTooltipContent openModal={openPremiumModal} />
          ) : undefined
        }
        content={
          hasUnsubscribeAccess
            ? "Auto archive emails using Gmail filters."
            : undefined
        }
      >
        <AutoArchiveButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
          refetchPremium={refetchPremium}
          userGmailLabels={userGmailLabels}
        />
      </Tooltip>
      <Tooltip
        contentComponent={
          !hasUnsubscribeAccess ? (
            <PremiumTooltipContent openModal={openPremiumModal} />
          ) : undefined
        }
        content={
          hasUnsubscribeAccess
            ? "Approve to filter it from the list."
            : undefined
        }
      >
        <ApproveButton
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          posthog={posthog}
        />
      </Tooltip>
      <MoreDropdown
        onOpenNewsletter={onOpenNewsletter}
        item={item}
        userEmail={userEmail}
        userGmailLabels={userGmailLabels}
        posthog={posthog}
      />
    </>
  );
}

function UnsubscribeButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
}) {
  const { unsubscribeLoading, onUnsubscribe } = useUnsubscribe({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  const isLink = hasUnsubscribeAccess && item.lastUnsubscribeLink;

  return (
    <Button
      size="sm"
      variant={
        item.status === NewsletterStatus.UNSUBSCRIBED ? "red" : "secondary"
      }
      asChild
    >
      <Link
        href={
          isLink
            ? cleanUnsubscribeLink(item.lastUnsubscribeLink || "") || ""
            : ""
        }
        target={isLink ? "_blank" : undefined}
        onClick={onUnsubscribe}
        rel="noreferrer"
      >
        {unsubscribeLoading && <ButtonLoader />}
        <span className="hidden xl:block">Unsubscribe</span>
        <span className="block xl:hidden">
          <MailMinusIcon className="size-4" />
        </span>
      </Link>
    </Button>
  );
}

function AutoArchiveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
  refetchPremium,
  userGmailLabels,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
  refetchPremium: () => Promise<any>;
  userGmailLabels: LabelsResponse["labels"];
}) {
  const {
    autoArchiveLoading,
    onAutoArchive,
    onAutoArchiveAndLabel,
    onDisableAutoArchive,
  } = useAutoArchive({
    item,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  return (
    <div
      className={clsx(
        "flex h-min items-center gap-1 rounded-md text-secondary-foreground",
        item.autoArchived ? "bg-blue-100" : "bg-secondary",
      )}
    >
      <Button
        variant={
          item.status === NewsletterStatus.AUTO_ARCHIVED || item.autoArchived
            ? "blue"
            : "secondary"
        }
        className="px-3 shadow-none"
        size="sm"
        onClick={onAutoArchive}
        disabled={!hasUnsubscribeAccess}
      >
        {autoArchiveLoading && <ButtonLoader />}
        <span className="hidden xl:block">Auto Archive</span>
        <span className="block xl:hidden">
          <ArchiveIcon className="size-4" />
        </span>
      </Button>
      <Separator orientation="vertical" className="h-[20px]" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={
              item.status === NewsletterStatus.AUTO_ARCHIVED ||
              item.autoArchived
                ? "blue"
                : "secondary"
            }
            className="px-2 shadow-none"
            size="sm"
            disabled={!hasUnsubscribeAccess}
          >
            <ChevronDownIcon className="size-4 text-secondary-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          alignOffset={-5}
          className="max-h-[415px] w-[220px] overflow-auto"
          forceMount
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
        >
          {item.autoArchived?.id && (
            <>
              <DropdownMenuItem
                onClick={async () => {
                  posthog.capture("Clicked Disable Auto Archive");
                  onDisableAutoArchive();
                }}
              >
                <ArchiveXIcon className="mr-2 size-4" /> Disable Auto Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuLabel>Auto Archive and Label</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {userGmailLabels?.map((label) => {
            return (
              <DropdownMenuItem
                key={label.id}
                onClick={async () => {
                  posthog.capture("Clicked Auto Archive and Label");
                  await onAutoArchiveAndLabel(label.id!);
                }}
              >
                {label.name}
              </DropdownMenuItem>
            );
          })}
          {!userGmailLabels?.length && (
            <DropdownMenuItem>
              You do not have any labels. Create one in Gmail first to auto
              label emails.
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ApproveButton<T extends Row>({
  item,
  hasUnsubscribeAccess,
  mutate,
  posthog,
}: {
  item: T;
  hasUnsubscribeAccess: boolean;
  mutate: () => Promise<void>;
  posthog: PostHog;
}) {
  const { approveLoading, onApprove } = useApproveButton({
    item,
    mutate,
    posthog,
  });

  return (
    <Button
      size="sm"
      variant={
        item.status === NewsletterStatus.APPROVED ? "green" : "secondary"
      }
      onClick={onApprove}
      disabled={!hasUnsubscribeAccess}
    >
      {approveLoading && <ButtonLoader />}
      <span className="sr-only">Keep</span>
      <span>
        <BadgeCheckIcon className="size-4" />
      </span>
    </Button>
  );
}

export function MoreDropdown<T extends Row>({
  onOpenNewsletter,
  item,
  userEmail,
  userGmailLabels,
  posthog,
}: {
  onOpenNewsletter?: (row: T) => void;
  item: T;
  userEmail: string;
  userGmailLabels: LabelsResponse["labels"];
  posthog: PostHog;
}) {
  const { archiveAllLoading, onArchiveAll } = useArchiveAll({
    item,
    posthog,
  });
  const { deleteAllLoading, onDeleteAll } = useDeleteAllFromSender({
    item,
    posthog,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-haspopup="true" size="icon" variant="ghost">
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!!onOpenNewsletter && (
          <DropdownMenuItem onClick={() => onOpenNewsletter(item)}>
            <ExpandIcon className="mr-2 size-4" />
            <span>View stats</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={getGmailSearchUrl(item.name, userEmail)} target="_blank">
            <ExternalLinkIcon className="mr-2 size-4" />
            <span>View in Gmail</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="mr-2 size-4" />
            <span>Add sender to group</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <GroupsSubMenu sender={item.name} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <TagIcon className="mr-2 size-4" />
            <span>Label future emails</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <LabelsSubMenu sender={item.name} labels={userGmailLabels} />
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={onArchiveAll}>
          {archiveAllLoading ? (
            <ButtonLoader />
          ) : (
            <ArchiveIcon className="mr-2 size-4" />
          )}
          <span>Archive all</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const yes = confirm(
              `Are you sure you want to delete all emails from ${item.name}?`,
            );
            if (!yes) return;

            onDeleteAll();
          }}
        >
          {deleteAllLoading ? (
            <ButtonLoader />
          ) : (
            <TrashIcon className="mr-2 size-4" />
          )}
          <span>Delete all</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HeaderButton(props: {
  children: React.ReactNode;
  sorted: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={props.onClick}
    >
      <span>{props.children}</span>
      {props.sorted ? (
        <ChevronDown className="ml-2 size-4" />
      ) : (
        <ChevronsUpDownIcon className="ml-2 size-4" />
      )}
    </Button>
  );
}

function GroupsSubMenu({ sender }: { sender: string }) {
  const { data, isLoading, error } = useSWR<GroupsResponse>(`/api/user/group`);

  return (
    <DropdownMenuSubContent>
      {data && (
        <>
          {data.groups.length ? (
            data?.groups.map((group) => {
              return (
                <DropdownMenuItem
                  key={group.id}
                  onClick={async () => {
                    const result = await addGroupItemAction({
                      groupId: group.id,
                      type: "FROM",
                      value: sender,
                    });

                    if (isActionError(result)) {
                      toastError({
                        description: `Failed to add ${sender} to ${group.name}. ${result.error}`,
                      });
                    } else {
                      toastSuccess({
                        title: "Success!",
                        description: `Added ${sender} to ${group.name}`,
                      });
                    }
                  }}
                >
                  {group.name}
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem>{`You don't have any groups yet.`}</DropdownMenuItem>
          )}
        </>
      )}
      {isLoading && <DropdownMenuItem>Loading...</DropdownMenuItem>}
      {error && <DropdownMenuItem>Error loading groups</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/automation?tab=groups" target="_blank">
          <PlusCircle className="mr-2 size-4" />
          <span>New Group</span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  );
}

function LabelsSubMenu({
  sender,
  labels,
}: {
  sender: string;
  labels: gmail_v1.Schema$Label[] | undefined;
}) {
  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels?.length ? (
        labels.map((label) => {
          return (
            <DropdownMenuItem
              key={label.id}
              onClick={async () => {
                if (label.id) {
                  const res = await createFilterAction(sender, label.id);
                  if (isErrorMessage(res)) {
                    toastError({
                      title: "Error",
                      description: `Failed to add ${sender} to ${label.name}. ${res.error}`,
                    });
                  } else {
                    toastSuccess({
                      title: "Success!",
                      description: `Added ${sender} to ${label.name}`,
                    });
                  }
                } else {
                  toastError({
                    title: "Error",
                    description: `Failed to add ${sender} to ${label.name}`,
                  });
                }
              }}
            >
              {label.name}
            </DropdownMenuItem>
          );
        })
      ) : (
        <DropdownMenuItem>{`You don't have any labels yet.`}</DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
