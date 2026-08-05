const fs = require('fs');

const allCourses = JSON.parse(fs.readFileSync('src/data/timetable/UG/CommonCourses.json', 'utf8'));

const batchNo = 1;

// Emulate initializeTimetable filtering
let excludedCodes = ['BT2010'];
if (batchNo >= 1 && batchNo <= 12) {
  excludedCodes.push('CY1140', 'EE1110');
} else if (batchNo >= 13 && batchNo <= 24) {
  excludedCodes.push('PH1130', 'ME1150');
}

let activeCourses = allCourses.filter(c => c.category?.toLowerCase().includes('core') && !excludedCodes.includes(c.courseCode));

activeCourses = activeCourses.map(course => {
  const newMeetings = course.meetings
    .filter(m => {
      const regex = /\bB(\d+)\s*-\s*B(\d+)\b/gi;
      let match;
      let hasRestriction = false;
      let allowed = false;
      while ((match = regex.exec(m.room)) !== null) {
        hasRestriction = true;
        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        if (batchNo >= start && batchNo <= end) {
          allowed = true;
        }
      }
      return !hasRestriction || allowed;
    })
    .map(m => {
      let finalRoom = m.room;
      if (m.room.includes('|') || /\bB\d+/.test(m.room)) {
        const parts = m.room.split('|').map(p => p.trim());
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
            .replace(/\(?\bB\d+\s*-\s*B\d+\b\)?/gi, '')
            .replace(/\(~\d+\s*students\)/gi, '')
            .replace(/\s+/g, ' ')
            .replace(/\s+\|\s+/g, ' | ')
            .trim();
        }
      }
      return { ...m, room: finalRoom };
    });
  return { ...course, meetings: newMeetings };
});

const meetingsList = [];
activeCourses.forEach(c => {
  c.meetings.forEach(m => {
    meetingsList.push({
      course: c.courseCode,
      day: m.day,
      start: m.startTime,
      end: m.endTime,
      type: m.type,
      room: m.room
    });
  });
});

const timeToMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const overlaps = [];
for (let i = 0; i < meetingsList.length; i++) {
  for (let j = i + 1; j < meetingsList.length; j++) {
    const m1 = meetingsList[i];
    const m2 = meetingsList[j];
    if (m1.day === m2.day) {
      const s1 = timeToMin(m1.start);
      const e1 = timeToMin(m1.end);
      const s2 = timeToMin(m2.start);
      const e2 = timeToMin(m2.end);
      if (Math.max(s1, s2) < Math.min(e1, e2)) {
        overlaps.push(`${m1.course} (${m1.type}) overlaps with ${m2.course} (${m2.type}) on ${m1.day} ${m1.start}-${m1.end} / ${m2.start}-${m2.end}`);
      }
    }
  }
}

if (overlaps.length > 0) {
  console.log("OVERLAPS DETECTED FOR B24:");
  overlaps.forEach(o => console.log(o));
} else {
  console.log("No overlaps for B24!");
}
