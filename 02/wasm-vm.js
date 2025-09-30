import assert from "node:assert";
import test from "node:test";


class Instruction {
  constructor(opcode, name, evalFn, immediate) {
    this.opcode = opcode;
    this.name = name;
    this.eval = evalFn;
    this.immediate = immediate;
  }
}


const instr = (opcode, name, evalFn, immediate = null) =>
  new Instruction(opcode, name, evalFn, immediate);


const nop = instr(0x01, "nop", (_vm) => {});


test("nop does nothing", () => {
  const rt = null;
  nop.eval(rt);
});


class I32 {
  constructor(value) {
    this.value = value;
  }
}


function i32(value = 0) {
  return new I32(value);
}


i32.const = (value) =>
  instr(0x41, "i32.const", (vm) => vm.push(i32(value)), value);


class Stack {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(value) {
    this.items.push(value);
  }
  pop() {
    return this.items.pop();
  }
  peek() {
    return this.items.at(-1);
  }
  popType(T) {
    this.assertTopIsOfType(T);
    return this.pop();
  }
  popI32() {
    return this.popType(I32);
  }
  topIsOfType(Class) {
    return this.peek() instanceof Class;
  }
  assertTopIsOfType(Class) {
    if (!this.topIsOfType(Class)) {
      throw new Error(
        `Expected ${Class.name} on top of stack, got ${this.peek()}`,
      );
    }
  }
}


test("i32.const pushes an I32 to the stack", () => {
  const vm = new Stack();
  const instr = i32.const(42);
  instr.eval(vm);
  assert.deepStrictEqual(vm.items, [i32(42)]);
});


const drop = instr(0x1a, "drop", (vm) => vm.pop());


function run(vm, instructions) {
  for (const instr of instructions) {
    instr.eval(vm);
  }
}


test("drop pops from the stack", () => {
  const vm = new Stack();
  run(vm, [i32.const(42), drop]);
  assert.strictEqual(vm.size, 0);
});


i32.add = instr(0x6a, "i32.add", (vm) => {
  const c2 = vm.popI32();
  const c1 = vm.popI32();
  vm.push(i32(c1.value + c2.value));
});


test("i32.add pops two I32s and pushes their sum", () => {
  const vm = new Stack();
  run(vm, [i32.const(42), i32.const(23), i32.add]);
  assert.deepStrictEqual(vm.items, [i32(65)]);
});


class VM {
  constructor(instructions) {
    this.stack = new Stack();
    this.instructions = instructions;
    this.pc = 0;
  }
  push(value) {
    this.stack.push(value);
  }
  pop() {
    return this.stack.pop();
  }
  peek() {
    return this.stack.peek();
  }
  popI32() {
    return this.stack.popI32();
  }
  popType(T) {
    return this.stack.popType(T);
  }
  step() {
    const instruction = this.instructions[this.pc];
    instruction.eval(this);
    this.pc += 1;
  }
}


function vmToData(vm) {
  return vm.stack.items;
}


test("VM executes two i32.const and an i32.add", () => {
  const vm = new VM([i32.const(42), i32.const(23), i32.add]);
  vm.step();
  assert.deepStrictEqual(vmToData(vm), [i32(42)]);
  vm.step();
  assert.deepStrictEqual(vmToData(vm), [i32(42), i32(23)]);
  vm.step();
  assert.deepStrictEqual(vmToData(vm), [i32(42 + 23)]);
});


I32.const = i32.const;
const binop = (opcode, name, fn, t = I32) =>
  instr(opcode, name, (vm) => {
    const c2 = vm.popType(t);
    const c1 = vm.popType(t);
    t.const(fn(c1.value, c2.value)).eval(vm);
  });


i32.sub = binop(0x6b, "i32.sub", (c1, c2) => c1 - c2);


function checkBinop(c1, c2, instruction, expected) {
  const vm = new VM([i32.const(c1), i32.const(c2), instruction]);
  vm.step();
  vm.step();
  vm.step();
  assert.deepStrictEqual(vmToData(vm), [i32(expected)]);
}


test("i32.sub", () => {
  checkBinop(42, 23, i32.sub, 42 - 23);
});


i32.mul = binop(0x6c, "i32.mul", (c1, c2) => c1 * c2);


test("i32.mul", () => {
  checkBinop(42, 23, i32.mul, 42 * 23);
});


i32.div_s = binop(0x6d, "i32.div_s", (c1, c2) => Math.trunc(c1 / c2));


test("i32.div_s", () => {
  checkBinop(42, 23, i32.div_s, Math.trunc(42 / 23));
});


const relop = (opcode, name, fn) =>
  binop(opcode, name, (c1, c2) => (fn(c1, c2) ? 1 : 0));


i32.eq = relop(0x46, "i32.eq", (c1, c2) => c1 === c2);


test("i32.eq", () => {
  checkBinop(42, 23, i32.eq, 0);
  checkBinop(23, 23, i32.eq, 1);
});


i32.ne = relop(0x47, "i32.ne", (c1, c2) => c1 !== c2);


test("i32.ne", () => {
  checkBinop(42, 23, i32.ne, 1);
  checkBinop(23, 23, i32.ne, 0);
});


i32.lt_s = relop(0x48, "i32.lt_s", (c1, c2) => c1 < c2);


test("i32.lt_s", () => {
  checkBinop(24, 23, i32.lt_s, 0);
  checkBinop(23, 23, i32.lt_s, 0);
  checkBinop(23, 24, i32.lt_s, 1);
});


i32.gt_s = relop(0x4a, "i32.gt_s", (c1, c2) => c1 > c2);


test("i32.gt_s", () => {
  checkBinop(24, 23, i32.gt_s, 1);
  checkBinop(23, 23, i32.gt_s, 0);
  checkBinop(23, 24, i32.gt_s, 0);
});


i32.le_s = relop(0x4c, "i32.le_s", (c1, c2) => c1 <= c2);


test("i32.le_s", () => {
  checkBinop(24, 23, i32.le_s, 0);
  checkBinop(23, 23, i32.le_s, 1);
  checkBinop(23, 24, i32.le_s, 1);
});


i32.ge_s = relop(0x4e, "i32.ge_s", (c1, c2) => c1 >= c2);


test("i32.ge_s", () => {
  checkBinop(24, 23, i32.ge_s, 1);
  checkBinop(23, 23, i32.ge_s, 1);
  checkBinop(23, 24, i32.ge_s, 0);
});




export { I32, drop, i32, instr, nop, vmToData, Stack, VM };
