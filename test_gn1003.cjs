const fs = require('fs');
const allCourses = JSON.parse(fs.readFileSync('src/data/timetable/UG/CommonCourses.json', 'utf8'));
const gn1003 = allCourses.find(c => c.courseCode === 'GN1003');
console.log(gn1003 ? "GN1003 Found" : "Not Found");
console.log("Category:", gn1003?.category);
if(gn1003) {
  console.log("Meetings:");
  gn1003.meetings.forEach(m => console.log(`${m.day} ${m.startTime}-${m.endTime} ${m.room}`));
}
