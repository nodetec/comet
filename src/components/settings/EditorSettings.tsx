import { useState } from "react";

import { getSetting, setSetting } from "~/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { useAppContext } from "~/store";
import { type SettingsSwitchKeys } from "~/types";

export default function EditorSettings() {
  const { settings, setSettings } = useAppContext();

  const [loading, setLoading] = useState(false);

  async function handleSwitchOnClick(
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    settingKey: SettingsSwitchKeys,
  ) {
    if (event.target instanceof HTMLButtonElement) {
      setLoading(true);
      const updatedSettings = { ...settings };
      try {
        if (event.target.dataset.state === "unchecked") {
          await setSetting(settingKey, "true");
          const getSettingResponse = await getSetting(settingKey);
          if (getSettingResponse.data === "true") {
            updatedSettings[settingKey] = getSettingResponse.data;
            setSettings(updatedSettings);
          }
        } else if (event.target.dataset.state === "checked") {
          await setSetting(settingKey, "false");
          const getSettingResponse = await getSetting(settingKey);
          if (getSettingResponse.data === "false") {
            updatedSettings[settingKey] = getSettingResponse.data;
            setSettings(updatedSettings);
          }
        }
      } catch (error) {
        console.error("Settings error: ", error);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleInputOnChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    console.log("handleInputOnChange event: ", event);
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
            <div className="flex items-center">
              <Label>Vim Mode</Label>
              <Switch
                checked={settings?.vim === "true"}
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
            <div className="flex items-center">
              <Label>Line Numbers</Label>
              <Switch
                checked={settings?.line_numbers === "true"}
                onClick={(event) => handleSwitchOnClick(event, "line_numbers")}
                className="ml-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Whether to show line numbers to the left of the editor
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center">
              <Label>Highlight Active Line</Label>
              <Switch
                checked={settings?.highlight_active_line === "true"}
                onClick={(event) =>
                  handleSwitchOnClick(event, "highlight_active_line")
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
            <div className="flex items-center">
              <Label>Line Wrapping</Label>
              <Switch
                checked={settings?.line_wrapping === "true"}
                onClick={(event) => handleSwitchOnClick(event, "line_wrapping")}
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
            <Select defaultValue={"*"}>
              <div>
                <SelectTrigger>
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
            <Label>Indent Unit</Label>
            <div>
              <Input
                id="editor-settings-indent-unit-input"
                name="editor-settings-indent-unit-input"
                type="number"
                placeholder="2"
                defaultValue="2"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              How many spaces a block should be indented
            </p>
          </div>
          <div className="space-y-2">
            <Label>Tab Size</Label>
            <div>
              <Input
                id="editor-settings-tab-size-input"
                name="editor-settings-tab-size-input"
                type="number"
                placeholder="4"
                defaultValue="4"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              The width of the tab character
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Size</Label>
            <div>
              <Input
                id="editor-settings-font-size-input"
                name="editor-settings-font-size-input"
                type="number"
                placeholder="14"
                defaultValue="14"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Height in pixels of editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Family</Label>
            <div>
              <Input
                id="editor-settings-font-family-input"
                name="editor-settings-font-family-input"
                type="text"
                placeholder=""
                defaultValue="SFMono-Regular,Consolas,Liberation Mono,Menlo,Courier,monospace"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              The name of the font family used for editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label>Font Weight</Label>
            <div>
              <Input
                id="editor-settings-font-weight-input"
                name="editor-settings-font-weight-input"
                type="text"
                placeholder="lighter, normal, bold, or bolder"
                defaultValue="normal"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              The weight of the font used for editor text
            </p>
          </div>
          <div className="space-y-2">
            <Label>Line Height</Label>
            <div>
              <Input
                id="editor-settings-line-height-input"
                name="editor-settings-line-height-input"
                type="number"
                placeholder="1.5"
                defaultValue="1.5"
                onChange={(event) => handleInputOnChange(event)}
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              Height of editor lines, as a multiplier of font size
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
