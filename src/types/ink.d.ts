import "ink";

declare module "ink" {
  // Extending Props to support additional properties used in this codebase
  interface Props {
    /** Display text inline (not on its own line) */
    inline?: boolean;
  }
}
