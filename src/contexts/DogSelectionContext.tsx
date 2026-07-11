import { createContext, type ReactNode } from "react";

import type { Doc, Id } from "../../convex/_generated/dataModel";

type DogOption = Pick<Doc<"dogs">, "_id" | "name">;

type DogSelection = {
  dogs: readonly DogOption[];
  activeDogId: Id<"dogs"> | null;
  selectDog: (dogId: Id<"dogs">) => void;
};

const DogSelectionContext = createContext<DogSelection | null>(null);

function DogSelectionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DogSelection;
}) {
  return (
    <DogSelectionContext.Provider value={value}>
      {children}
    </DogSelectionContext.Provider>
  );
}

function DogSelectionConsumer({
  children,
}: {
  children: (value: DogSelection | null) => ReactNode;
}) {
  return (
    <DogSelectionContext.Consumer>{children}</DogSelectionContext.Consumer>
  );
}

export { DogSelectionConsumer, DogSelectionProvider };
export type { DogSelection };
