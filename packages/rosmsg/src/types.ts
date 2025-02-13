import { MessageDefinition } from "@foxglove/message-definition";

/** A message definition whose name is known */
export type NamedMessageDefinition = MessageDefinition & {
  name: NonNullable<MessageDefinition["name"]>;
};
