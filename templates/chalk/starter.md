---
marp: true
theme: marpora-chalk
size: 16:9
paginate: true
header: Marpora / Chalk
footer: Ownership, one idea at a time
---

<!-- _class: title -->
<!-- _paginate: false -->

# Understand it.<br>Then make it yours.

A short lesson on ownership in Rust.

<!-- Ask students what they expect the word ownership to mean. Their answers are useful, even before the code. -->

---

## Today’s three questions.

<div class="columns three">
<div>

<div class="lesson-step">1</div>

### Who owns it?

Connect a value to the variable responsible for it.

</div>
<div>

<div class="lesson-step">2</div>

### What can move?

Trace what happens when a value changes hands.

</div>
<div>

<div class="lesson-step">3</div>

### How do I know?

Explain a compiler error in your own words.

</div>
</div>

---

<!-- _class: statement -->

# A value has<br>one owner.

<div class="callout">When the owner leaves scope, the value is dropped.</div>

<!-- Keep this rule visible while discussing a simple example. Avoid introducing borrowing until the class can explain a move. -->

---

## Follow the value.

<div class="columns">
<div>

```rust
let first = String::from("hello");
let second = first;

println!("{second}");
```

</div>
<div>

### What changed?

`second` now owns the string.

<pause>

`first` can no longer be used.

</div>
</div>

<!-- Reveal the final sentence only after learners predict what happens. The UIC pause interaction works here as well. -->

---

<!-- _class: question -->

## Predict before you run it.

```rust
let first = String::from("hello");
let second = first;
println!("{first}");
```

1. It prints `hello`.
2. It prints an empty string.
3. The compiler rejects it.

<!-- Give students time to choose. Ask someone to explain the rule before revealing the answer. -->

---

<!-- _class: answer -->

## The compiler protects the rule.

* The string moved from `first` to `second`.
* Using `first` again would break the ownership rule.
* Change the last line to `println!("{second}");`.

<div class="callout">Turn to a partner: explain the move without reading the code.</div>

<!-- These three points reveal one at a time. Listen for the words owner and move in the discussion. -->

---

<!-- _class: closing -->
<!-- _paginate: false -->

# One idea.<br>One example.<br>One explanation.

What would you try next?
