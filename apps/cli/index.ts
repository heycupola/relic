import { dlopen, FFIType, suffix } from "bun:ffi";

const path = `./rust/target/debug/librust.${suffix}`;

const lib = dlopen(path, {
  add: {
    args: [FFIType.u64, FFIType.u64],
    returns: FFIType.u64
  }
});

const result = lib.symbols.add(5, 3);
console.log("Result:", Number(result));
