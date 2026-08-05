const fs = require('fs');
const courses = JSON.parse(fs.readFileSync('src/data/timetable/UG/CommonCourses.json', 'utf8'));

const batchNo = 24;

const filtered = courses.map(course => {
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
            
            // If no batch restriction is mentioned, it's for everyone.
            return !hasRestriction || allowed;
        })
        .map(m => {
            let customRoom = null;
            if (course.courseCode === 'ME1130') {
                if (m.type === 'lab') customRoom = 'A01-112 (Drawing Hall)';
                else if (batchNo <= 5) customRoom = 'C06-105';
                else if (batchNo <= 10) customRoom = 'C06-106';
                else if (batchNo <= 15) customRoom = 'C06-107';
                else if (batchNo <= 20) customRoom = 'C06-104';
                else customRoom = 'N305';
            }
            if (customRoom) {
                return { ...m, room: customRoom };
            }
            return m;
        });
        
    return { ...course, meetings: newMeetings };
});

const me1130 = filtered.find(c => c.courseCode === 'ME1130');
console.log("ME1130 Meetings:", JSON.stringify(me1130.meetings, null, 2));

const ma1011a = filtered.find(c => c.courseCode === 'MA1011A');
console.log("MA1011A Meetings:", JSON.stringify(ma1011a.meetings, null, 2));
