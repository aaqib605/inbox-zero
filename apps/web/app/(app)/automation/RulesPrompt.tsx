"use client";

import { useCallback, useEffect, useState } from "react";
import { SparklesIcon, UserPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  saveRulesPromptAction,
  generateRulesPromptAction,
} from "@/utils/actions/ai-rule";
import { isActionError } from "@/utils/error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/Input";
import {
  saveRulesPromptBody,
  type SaveRulesPromptBody,
} from "@/utils/actions/validation";
import { SectionHeader } from "@/components/Typography";
import type { RulesPromptResponse } from "@/app/api/user/rules/prompt/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { handleActionCall } from "@/utils/server-action";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { AutomationOnboarding } from "@/app/(app)/automation/AutomationOnboarding";
import { examplePrompts, personas } from "@/app/(app)/automation/examples";
import { PersonaDialog } from "@/app/(app)/automation/PersonaDialog";
import { useModal } from "@/components/Modal";
// import { ProcessingPromptFileDialog } from "@/app/(app)/automation/ProcessingPromptFileDialog";

export function RulesPrompt() {
  const { data, isLoading, error, mutate } = useSWR<
    RulesPromptResponse,
    { error: string }
  >("/api/user/rules/prompt");
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(() => {
    setIsModalOpen(true);
  }, [setIsModalOpen]);

  const [persona, setPersona] = useState<string | null>(null);

  const personaPrompt = persona
    ? personas[persona as keyof typeof personas]?.prompt
    : undefined;

  return (
    <>
      <LoadingContent loading={isLoading} error={error}>
        <RulesPromptForm
          rulesPrompt={data?.rulesPrompt || undefined}
          personaPrompt={personaPrompt}
          mutate={mutate}
          onOpenPersonaDialog={onOpenPersonaDialog}
        />
      </LoadingContent>
      <AutomationOnboarding onComplete={onOpenPersonaDialog} />
      <PersonaDialog
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        onSelect={setPersona}
      />
    </>
  );
}

function RulesPromptForm({
  rulesPrompt,
  personaPrompt,
  mutate,
  onOpenPersonaDialog,
}: {
  rulesPrompt?: string;
  personaPrompt?: string;
  mutate: () => void;
  onOpenPersonaDialog: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // const [isDialogOpen, setIsDialogOpen] = useState(false);
  // const [result, setResult] = useState<{
  //   createdRules: number;
  //   editedRules: number;
  //   removedRules: number;
  // }>();
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
    reset,
  } = useForm<SaveRulesPromptBody>({
    resolver: zodResolver(saveRulesPromptBody),
    defaultValues: { rulesPrompt },
  });

  useEffect(() => {
    reset({ rulesPrompt: personaPrompt || rulesPrompt });
  }, [rulesPrompt, personaPrompt, reset]);

  const router = useRouter();

  const onSubmit = useCallback(
    async (data: SaveRulesPromptBody) => {
      setIsSubmitting(true);

      const saveRulesPromise = async (data: SaveRulesPromptBody) => {
        setIsSubmitting(true);
        const result = await handleActionCall("saveRulesPromptAction", () =>
          saveRulesPromptAction(data),
        );

        if (isActionError(result)) {
          setIsSubmitting(false);
          throw new Error(result.error);
        }

        router.push("/automation?tab=test");
        mutate();
        setIsSubmitting(false);

        return result;
      };

      // setIsDialogOpen(true);
      // setResult(undefined);

      toast.promise(() => saveRulesPromise(data), {
        loading: "Saving rules... This may take a while to process...",
        success: (result) => {
          // setResult(result);
          const { createdRules, editedRules, removedRules } = result || {};

          const message = [
            createdRules ? `${createdRules} rules created.` : "",
            editedRules ? `${editedRules} rules edited.` : "",
            removedRules ? `${removedRules} rules removed.` : "",
          ]
            .filter(Boolean)
            .join(" ");

          return `Rules saved successfully! ${message}`;
        },
        error: (err) => {
          return `Error saving rules: ${err.message}`;
        },
      });
    },
    [router, mutate],
  );

  const addExamplePrompt = useCallback(
    (example: string) => {
      setValue(
        "rulesPrompt",
        `${getValues("rulesPrompt")}\n* ${example.trim()}`.trim(),
      );
    },
    [setValue, getValues],
  );

  return (
    <div>
      <PremiumAlertWithData className="my-2" />

      <Card className="grid grid-cols-1 sm:grid-cols-3">
        <div className="sm:col-span-2">
          {/* <ProcessingPromptFileDialog
          open={isDialogOpen}
          result={result}
          onOpenChange={setIsDialogOpen}
          isLoading={isSubmitting}
        /> */}

          <CardHeader>
            <CardTitle>
              How your AI personal assistant should handle incoming emails
            </CardTitle>
            <CardDescription>
              Write a prompt for your assistant to follow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-4 sm:col-span-2">
                <Input
                  className="min-h-[300px]"
                  registerProps={register("rulesPrompt", { required: true })}
                  name="rulesPrompt"
                  type="text"
                  autosizeTextarea
                  rows={25}
                  maxRows={50}
                  error={errors.rulesPrompt}
                  placeholder={`Here's an example of what your prompt might look like.
You can use the examples on the right or come up with your own.
Feel free to add as many as you want:

* Label and archive newsletters as "Newsletter".
* Archive all marketing emails.
* Label receipts as "Receipt" and forward them to jane@accounting.com.
* Label emails that require a reply as "Reply Required".
* If a customer asks to set up a call, send them my Cal link: https://cal.com/example
* Review any emails from questions@pr.com and see if any are about finance. If so, respond with a friendly draft a reply that answers the question.`}
                />

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || isGenerating}
                    loading={isSubmitting}
                  >
                    Save
                  </Button>

                  <Tooltip content="Our AI will analyze your Gmail inbox and create a customized prompt for your assistant.">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || isGenerating}
                      onClick={async () => {
                        if (isSubmitting || isGenerating) return;
                        toast.promise(
                          async () => {
                            setIsGenerating(true);
                            const result = await handleActionCall(
                              "generateRulesPromptAction",
                              generateRulesPromptAction,
                            );

                            if (isActionError(result)) {
                              setIsGenerating(false);
                              throw new Error(result.error);
                            }

                            const currentPrompt = getValues("rulesPrompt");
                            const updatedPrompt = currentPrompt
                              ? `${currentPrompt}\n\n${result.rulesPrompt}`
                              : result.rulesPrompt;
                            setValue("rulesPrompt", updatedPrompt.trim());

                            setIsGenerating(false);

                            return result;
                          },
                          {
                            loading: "Generating prompt...",
                            success: (result) => {
                              return "Prompt generated successfully!";
                            },
                            error: (err) => {
                              return `Error generating prompt: ${err.message}`;
                            },
                          },
                        );
                      }}
                      loading={isGenerating}
                    >
                      <SparklesIcon className="mr-2 size-4" />
                      Give me ideas
                    </Button>
                  </Tooltip>

                  <Button variant="outline" onClick={onOpenPersonaDialog}>
                    <UserPenIcon className="mr-2 size-4" />
                    Choose persona
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </div>
        <div className="px-6 pb-4 sm:mt-8 sm:p-0">
          <SectionHeader>Examples</SectionHeader>

          <ScrollArea className="mt-2 sm:h-[600px] sm:max-h-[600px]">
            <div className="grid grid-cols-1 gap-2 sm:pr-3">
              {examplePrompts.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  onClick={() => addExamplePrompt(example)}
                  className="h-auto w-full justify-start text-wrap py-2 text-left"
                >
                  {example}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}
