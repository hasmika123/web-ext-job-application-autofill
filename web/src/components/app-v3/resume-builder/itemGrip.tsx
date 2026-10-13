"use client";

import { createContext, useContext } from "react";
import type { HTMLAttributes, Ref } from "react";

/** The sortable props of one canvas item row; present only while the Swap Section panel is open. */
export type ItemGrip = HTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> };

const Ctx = createContext<ItemGrip | null>(null);

export const ItemGripProvider = Ctx.Provider;

/** The grip props for the item row being drawn, or null when rows are not draggable. */
export const useItemGrip = (): ItemGrip | null => useContext(Ctx);
