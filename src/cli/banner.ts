import figlet from "figlet";
import gradient from "gradient-string";
import chalk from "chalk";

const jestGradient = gradient([
  "#99424f",
  "#c63d14",
  "#ef4e2a",
  "#f5a623",
  "#fcc72b",
]);

export const printBanner = (): void => {
  const text = figlet.textSync("NG-JESTER", { font: "ANSI Shadow" });
  console.log("");
  console.log(jestGradient.multiline(text));
  console.log(chalk.dim("Jest test generator for Angular"));
  console.log("");
};
