import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  const queryClient = useQueryClient();

  const orderBy = useAppState((state) => state.orderBy);
  const setOrderBy = useAppState((state) => state.setOrderBy);
  const titleSortDirection = useAppState((state) => state.titleSortDirection);
  const timeSortDirection = useAppState((state) => state.timeSortDirection);
  const setTitleSortDirection = useAppState((state) => state.setTitleSortDirection);
  const setTimeSortDirection = useAppState((state) => state.setTimeSortDirection);

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
          <DropdownMenuSubTrigger
            className="cursor-pointer"
          >
            Sort by
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={orderBy}
                onValueChange={handleSortChange}
              >
                <DropdownMenuRadioItem
                  className="cursor-pointer"
                  value="modified_at"
                >
                  Modification Date
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  className="cursor-pointer"
                  value="created_at"
                >
                  Creation Date
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem className="cursor-pointer" value="title">
                  Title
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              {orderBy === "title" ? (
                <DropdownMenuRadioGroup
                  value={titleSortDirection}
                  onValueChange={handleDirectionChange}
                >
                  <DropdownMenuRadioItem className="cursor-pointer" value="ASC">
                    A-Z
                  </DropdownMenuRadioItem>

                  <DropdownMenuRadioItem
                    className="cursor-pointer"
                    value="DESC"
                  >
                    Z-A
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              ) : (
                <DropdownMenuRadioGroup
                  value={timeSortDirection}
                  onValueChange={handleDirectionChange}
                >
                  <DropdownMenuRadioItem
                    className="cursor-pointer"
                    value="DESC"
                  >
                    Newest On Top
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem className="cursor-pointer" value="ASC">
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
