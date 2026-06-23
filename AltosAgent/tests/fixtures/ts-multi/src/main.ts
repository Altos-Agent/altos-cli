import { formatDate, formatCurrency } from "./utils/format.js";
import { greet } from "./lib/helpers.js";

console.log(greet("World"));
console.log(formatDate(new Date()));
console.log(formatCurrency(1234.56, "USD"));
