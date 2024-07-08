import { useEffect, useState } from "react";
import * as React from "react";

import { CaretSortIcon } from "@radix-ui/react-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as wails from "@wailsio/runtime";
import {
  Settings,
  SettingService,
} from "&/github.com/nodetec/captains-log/service";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { comboboxPrioritizedFontFamilies } from "~/lib/settings/constants";
import {
  initialUserSelectedFontFamily,
  prioritizeUserFontFamilies,
} from "~/lib/settings/utils";
import { cn } from "~/lib/utils";
import { type FontSize, type IndentSpaces } from "~/types/settings";
import { partialEditorSettingsSchema } from "~/validation/schemas";
import { Check } from "lucide-react";

type Props = {
  settings: Settings;
};

export default function EditorSettings({ settings }: Props) {
  const [loading, setLoading] = useState(false);
  const [openFontFamilyCombobox, setOpenFontFamilyCombobox] = useState(false);

  const [editorSettings, setEditorSettings] = useState({
    selectedFontFamily: settings.FontFamily,
    lineHeight: settings.LineHeight,
  });

  const [errorMessages, setErrorMessages] = useState({
    lineHeight: "",
  });

  useEffect(() => {
    setEditorSettings({
      ...editorSettings,
      selectedFontFamily: initialUserSelectedFontFamily(settings.FontFamily),
    });
  }, []);

  const queryClient = useQueryClient();

  // TODO
  // Where should the errors and loading be taken of?
  async function updateSetting(key, value) {
    await SettingService.UpdateSetting(key, value);
  }

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      wails.Events.Emit({ name: "settingsChanged", data: "" });
    },
    onError: () => {},
  });

  async function handleSwitchOnClick(
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    key: string,
  ) {
    if (event.target instanceof HTMLButtonElement) {
      setLoading(true);
      try {
        if (event.target.dataset.state === "unchecked") {
          mutation.mutate({ key, value: "true" });
        } else if (event.target.dataset.state === "checked") {
          mutation.mutate({ key, value: "false" });
        }
      } catch (error) {
        console.error("Editor settings error: ", error);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleSelectOnValueChange(
    key: string,
    value: FontSize | IndentSpaces,
  ) {
    setLoading(true);
    try {
      mutation.mutate({ key, value });
    } catch (error) {
      console.error("Editor settings error: ", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleInputOnBlur(key: string, value: string) {
    setLoading(true);
    try {
      const validationResult = partialEditorSettingsSchema.safeParse({
        [key]: value,
      });

      if (validationResult.success) {
        mutation.mutate({ key, value });
        setErrorMessages({ ...errorMessages, [key]: "" });
      } else {
        setErrorMessages({
          ...errorMessages,
          [key]: validationResult.error.issues[0].message,
        });
      }
    } catch (error) {
      console.error("Editor settings error: ", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleComboxOnSelect(key: string, value: string) {
    setLoading(true);
    try {
      mutation.mutate({ key, value: prioritizeUserFontFamilies(value) });
      setEditorSettings({
        ...editorSettings,
        selectedFontFamily:
          value === editorSettings.selectedFontFamily ? "" : value,
      });
      setOpenFontFamilyCombobox(false);
    } catch (error) {
      console.error("Editor settings error: ", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-card/20">
      <CardHeader>
        <CardTitle>Editor</CardTitle>
        <CardDescription>Configure your note editor</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Vim Mode</Label>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Enable vim mode
                </p>
              </div>
              <Switch
                checked={settings.Vim === "true"}
                onClick={(event) => handleSwitchOnClick(event, "vim")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Line Numbers</Label>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Show line numbers
                </p>
              </div>
              <Switch
                checked={settings.LineNumbers === "true"}
                onClick={(event) => handleSwitchOnClick(event, "lineNumbers")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Highlight Active Line</Label>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Highlight current cursor line
                </p>
              </div>
              <Switch
                checked={settings.HighlightActiveLine === "true"}
                onClick={(event) =>
                  handleSwitchOnClick(event, "highlightActiveLine")
                }
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Line Wrapping</Label>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Scroll or wrap for long lines
                </p>
              </div>
              <Switch
                checked={settings.LineWrapping === "true"}
                onClick={(event) => handleSwitchOnClick(event, "lineWrapping")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Indent Spaces</Label>
            <Select
              name="editor-settings-indent-spaces-select"
              value={settings.IndentSpaces}
              disabled={loading}
              onValueChange={(value: IndentSpaces) =>
                handleSelectOnValueChange("indentSpaces", value)
              }
            >
              <div>
                <SelectTrigger className="disabled:cursor-pointer disabled:opacity-100">
                  <SelectValue placeholder="Select an indent space value" />
                </SelectTrigger>
              </div>
              <SelectContent>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.8rem] text-muted-foreground">
              Number of spaces in a tab
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Size</Label>
            <Select
              name="editor-settings-font-size-select"
              value={settings.FontSize}
              disabled={loading}
              onValueChange={(value: FontSize) =>
                handleSelectOnValueChange("fontSize", value)
              }
            >
              <div>
                <SelectTrigger className="disabled:cursor-pointer disabled:opacity-100">
                  <SelectValue placeholder="Select a font size" />
                </SelectTrigger>
              </div>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.8rem] text-muted-foreground">
              Size of editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Family</Label>
            <div>
              <Popover
                open={openFontFamilyCombobox}
                onOpenChange={setOpenFontFamilyCombobox}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="editor-settings-font-family-btn"
                    name="editor-settings-font-family-btn"
                    variant="outline"
                    role="combobox"
                    aria-expanded={openFontFamilyCombobox}
                    className="w-full justify-between bg-transparent px-3 font-normal hover:bg-transparent disabled:opacity-100"
                    disabled={loading}
                  >
                    {editorSettings.selectedFontFamily
                      ? comboboxPrioritizedFontFamilies.find(
                          (fontFamily) =>
                            fontFamily.value ===
                            editorSettings.selectedFontFamily,
                        )?.label
                      : "Select font family..."}
                    <CaretSortIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align={"start"} className="p-0">
                  <Command>
                    <CommandInput placeholder="Search font families..." />
                    <CommandList>
                      <CommandEmpty>No font family found</CommandEmpty>
                      <CommandGroup>
                        {comboboxPrioritizedFontFamilies.map((fontFamily) => (
                          <CommandItem
                            key={fontFamily.value}
                            value={fontFamily.value}
                            onSelect={(currentValue) =>
                              handleComboxOnSelect("fontFamily", currentValue)
                            }
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                editorSettings.selectedFontFamily ===
                                  fontFamily.value
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {fontFamily.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Font family of editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label
              className={`${errorMessages.lineHeight === "" ? "" : "text-destructive"}`}
            >
              Line Height
            </Label>
            <div>
              <Input
                id="editor-settings-line-height-input"
                name="editor-settings-line-height-input"
                type="number"
                placeholder="2"
                className="disabled:cursor-text disabled:opacity-100"
                disabled={loading}
                min="1"
                max="5"
                step="0.5"
                value={editorSettings.lineHeight}
                onChange={(event) =>
                  setEditorSettings({
                    ...editorSettings,
                    lineHeight: event.currentTarget.value,
                  })
                }
                onBlur={() =>
                  handleInputOnBlur("lineHeight", editorSettings.lineHeight)
                }
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Height of editor lines, as a multiplier of font size
            </p>
            {errorMessages.lineHeight !== "" && (
              <p
                id="editor-settings-line-height-input-error-message"
                className="text-[0.8rem] font-medium text-destructive"
              >
                {errorMessages.lineHeight}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
