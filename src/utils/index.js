import * as R from "ramda";

export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}
