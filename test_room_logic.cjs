const tests = [
  "C06-105 (B1-B6) | C06-106 (B7-B12) | C06-107 (B13-B18) | C06-104 (B19-B24)",
  "N203 (B1-B11)  (~132 students) | N305 (B12-B18) (~84 students) | C6-104 (B19-B24)  (~72 students)",
  "A01-112(Drawing Hall) (B16-B20)",
  "A01-007(B1-B24)",
  "B3 (80 seater)",
  "N-203/204 (theory) Nila-computer labs"
];

const batchNo = 24;

tests.forEach(room => {
  let finalRoom = room;
  
  if (room.includes('|') || /\bB\d+/.test(room)) {
    const parts = room.split('|').map(p => p.trim());
    const validParts = parts.filter(part => {
      const regex = /\bB(\d+)\s*-\s*B(\d+)\b/gi;
      let match;
      let hasRestriction = false;
      let allowed = false;
      while ((match = regex.exec(part)) !== null) {
        hasRestriction = true;
        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        if (batchNo >= start && batchNo <= end) {
          allowed = true;
        }
      }
      return !hasRestriction || allowed;
    });
    
    if (validParts.length > 0) {
      finalRoom = validParts.join(' | ')
        .replace(/\(?\bB\d+\s*-\s*B\d+\b\)?/gi, '') // Remove (B1-B5) or B1-B5
        .replace(/~\d+ students/gi, '') // Remove ~132 students
        .replace(/[()]/g, '') // Remove leftover parentheses
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .replace(/\s+\|\s+/g, ' | ') // Clean up around pipes
        .trim();
        
      // Sometimes there's a trailing or leading pipe if empty? No, validParts.join already handles it.
    }
  }
  
  console.log(`Original: ${room}`);
  console.log(`Cleaned (Batch ${batchNo}): ${finalRoom}`);
  console.log('---');
});
