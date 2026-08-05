const regex = /\bB(\d+)\s*-\s*B(\d+)\b/gi;
const room = "C06-105 + C06  Electronics Lab (B13-B16)";
let match;
while ((match = regex.exec(room)) !== null) {
  console.log("Matched:", match[0], "Start:", match[1], "End:", match[2]);
}
