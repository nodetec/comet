import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAppState } from "~/store";

export function SortDropdown({ children }: { children: React.ReactNode }) {
  const {
    orderBy,
    setOrderBy,
    timeSortDirection,
    setTimeSortDirection,
    titleSortDirection,
    setTitleSortDirection,
  } = useAppState();
  const queryClient = useQueryClient();

  const handleSortChange = (e: string) => {
    const value = e as "modified_at" | "created_at" | "title";
    console.log(e);
    setOrderBy(value);
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
  };

  const handleDirectionChange = (e: string) => {
    const value = e as "ASC" | "DESC";
    if (orderBy === "title") {
      setTitleSortDirection(value);
    } else {
      setTimeSortDirection(value);
    }
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {/* TODO: show note count */}
        {/* <DropdownMenuLabel className="text-xs text-muted-foreground"> */}
        {/*   600 notes */}
        {/* </DropdownMenuLabel> */}
        {/* <DropdownMenuSeparator /> */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span>Sort by</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={orderBy}
                onValueChange={handleSortChange}
              >
                <DropdownMenuRadioItem value="modified_at">
                  Modification Date
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created_at">
                  Creation Date
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="title">
                  Title
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              {orderBy === "title" ? (
                <DropdownMenuRadioGroup
                  value={titleSortDirection}
                  onValueChange={handleDirectionChange}
                >
                  <DropdownMenuRadioItem value="DESC">A-Z</DropdownMenuRadioItem>

                  <DropdownMenuRadioItem value="ASC">
                    Z-A
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              ) : (
                <DropdownMenuRadioGroup
                  value={timeSortDirection}
                  onValueChange={handleDirectionChange}
                >
                  <DropdownMenuRadioItem value="ASC">
                    Newest On Top
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="DESC">
                    Oldest On Top
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
