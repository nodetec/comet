import { useEffect, useState } from "react";
import * as React from "react";

import { CaretSortIcon } from "@radix-ui/react-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingService } from "&/github.com/nodetec/captains-log/service";
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
// import {
//   initialUserSelectedFontFamily,
//   prioritizeUserFontFamilies,
// } from "~/lib/settings/utils";
import { cn } from "~/lib/utils";
import { type FontWeight, type UnorderedListBullet } from "~/types/settings";
import { partialEditorSettingsSchema } from "~/validation/schemas";
import { Check } from "lucide-react";

export default function EditorSettings() {
  // TODO
  // Load the initial settings
  const [editorSettings, setEditorSettings] = useState({
    indentUnit: "",
    tabSize: "",
    fontSize: "",
    // Initially was ""
    selectedFontFamily: "",
    fontWeight: "",
    lineHeight: "",
  });

  const [errorMessages, setErrorMessages] = useState({
    indentUnit: "",
    tabSize: "",
    fontSize: "",
    lineHeight: "",
  });
  const queryClient = useQueryClient();

  // TODO
  // Where should the errors and loading be taken of?
  const { isPending, data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
  });

  async function fetchSettings() {
    const settings = await SettingService.GetAllSettings();
    return settings;
  }

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
    },
    onError: () => {},
  });

  const [loading, setLoading] = useState(false);
  const [openFontFamilyCombobox, setOpenFontFamilyCombobox] = useState(false);

  useEffect(() => {
    // TODO
    // Handle the font family
    // setEditorSettings({
    //   ...editorSettings,
    //   selectedFontFamily: initialUserSelectedFontFamily(settings.font_family),
    // });
  }, []);

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
    value: UnorderedListBullet | FontWeight,
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
      // await updateSetting(key, prioritizeUserFontFamilies(value));
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

  if (isPending) return <div>Loading...</div>;

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
              <Label>Vim Mode</Label>
              <Switch
                checked={data?.Vim === "true"}
                onClick={(event) => handleSwitchOnClick(event, "vim")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Whether to enable vim mode in the editor
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Numbers</Label>
              <Switch
                checked={data?.LineNumbers === "true"}
                onClick={(event) => handleSwitchOnClick(event, "lineNumbers")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Whether to show line numbers to the left of the editor
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Highlight Active Line</Label>
              <Switch
                checked={data?.HighlightActiveLine === "true"}
                onClick={(event) =>
                  handleSwitchOnClick(event, "highlightActiveLine")
                }
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Whether to highlight the current cursor line
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Wrapping</Label>
              <Switch
                checked={data?.LineWrapping === "true"}
                onClick={(event) => handleSwitchOnClick(event, "lineWrapping")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Whether the editor should scroll or wrap for long lines
            </p>
          </div>
          <div className="space-y-2">
            <Label>Unordered List Bullet</Label>
            <Select
              name="editor-settings-unordered-list-bullet-select"
              value={data?.UnorderedListBullet}
              disabled={loading}
              onValueChange={(value: UnorderedListBullet) =>
                handleSelectOnValueChange("unorderedListBullet", value)
              }
            >
              <div>
                <SelectTrigger className="disabled:cursor-pointer disabled:opacity-100">
                  <SelectValue placeholder="Select an unordered list bullet" />
                </SelectTrigger>
              </div>
              <SelectContent>
                <SelectItem value="-">-</SelectItem>
                <SelectItem value="*">*</SelectItem>
                <SelectItem value="+">+</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.8rem] text-muted-foreground">
              Marker to use for the bullet of unordered list items
            </p>
          </div>
          <div className="space-y-2">
            <Label
              className={`${errorMessages.indentUnit === "" ? "" : "text-destructive"}`}
            >
              Indent Unit
            </Label>
            <div>
              <Input
                id="editor-settings-indent-unit-input"
                name="editor-settings-indent-unit-input"
                type="number"
                placeholder="4"
                className="disabled:cursor-text disabled:opacity-100"
                disabled={loading}
                min="0"
                max="100"
                value={editorSettings.indentUnit}
                onChange={(event) =>
                  setEditorSettings({
                    ...editorSettings,
                    indentUnit: event.currentTarget.value,
                  })
                }
                onBlur={() =>
                  handleInputOnBlur("indentUnit", editorSettings.indentUnit)
                }
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              How many spaces a block should be indented
            </p>
            {errorMessages.indentUnit !== "" && (
              <p
                id="editor-settings-indent-unit-input-error-message"
                className="text-[0.8rem] font-medium text-destructive"
              >
                {errorMessages.indentUnit}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label
              className={`${errorMessages.tabSize === "" ? "" : "text-destructive"}`}
            >
              Tab Size
            </Label>
            <div>
              <Input
                id="editor-settings-tab-size-input"
                name="editor-settings-tab-size-input"
                type="number"
                placeholder="4"
                className="disabled:cursor-text disabled:opacity-100"
                disabled={loading}
                min="0"
                max="100"
                value={editorSettings.tabSize}
                onChange={(event) =>
                  setEditorSettings({
                    ...editorSettings,
                    tabSize: event.currentTarget.value,
                  })
                }
                onBlur={() =>
                  handleInputOnBlur("tabSize", editorSettings.tabSize)
                }
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              The width of the tab character
            </p>
            {errorMessages.tabSize !== "" && (
              <p
                id="editor-settings-tab-size-input-error-message"
                className="text-[0.8rem] font-medium text-destructive"
              >
                {errorMessages.tabSize}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label
              className={`${errorMessages.fontSize === "" ? "" : "text-destructive"}`}
            >
              Font Size
            </Label>
            <div>
              <Input
                id="editor-settings-font-size-input"
                name="editor-settings-font-size-input"
                type="number"
                placeholder="16"
                className="disabled:cursor-text disabled:opacity-100"
                disabled={loading}
                min="1"
                max="100"
                value={editorSettings.fontSize}
                onChange={(event) =>
                  setEditorSettings({
                    ...editorSettings,
                    fontSize: event.currentTarget.value,
                  })
                }
                onBlur={() =>
                  handleInputOnBlur("fontSize", editorSettings.fontSize)
                }
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Height in pixels of editor text
            </p>
            {errorMessages.fontSize !== "" && (
              <p
                id="editor-settings-font-size-input-error-message"
                className="text-[0.8rem] font-medium text-destructive"
              >
                {errorMessages.fontSize}
              </p>
            )}
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
                              handleComboxOnSelect("font_family", currentValue)
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
              The name of the font family used for editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Weight</Label>
            <Select
              name="editor-settings-font-weight-select"
              value={data?.FontWeight}
              disabled={loading}
              onValueChange={(value: FontWeight) =>
                handleSelectOnValueChange("fontWeight", value)
              }
            >
              <div>
                <SelectTrigger className="disabled:cursor-pointer disabled:opacity-100">
                  <SelectValue placeholder="Select a font weight" />
                </SelectTrigger>
              </div>
              <SelectContent>
                <SelectItem value="lighter">lighter</SelectItem>
                <SelectItem value="normal">normal</SelectItem>
                <SelectItem value="bold">bold</SelectItem>
                <SelectItem value="bolder">bolder</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.8rem] text-muted-foreground">
              The weight of the font used for editor text
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
                placeholder="1.5"
                className="disabled:cursor-text disabled:opacity-100"
                disabled={loading}
                min="1"
                max="10"
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
