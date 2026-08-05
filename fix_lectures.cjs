const fs = require('fs');
const file = 'src/data/timetable/UG/CommonCourses.json';
let data = JSON.parse(fs.readFileSync(file, 'utf8'));

data = data.map(course => {
  if (course.courseCode === 'ME1130') {
    // Keep only Monday lecture, plus all labs
    course.meetings = course.meetings.filter(m => {
      if (m.type === 'lecture') {
        return m.day === 'Monday';
      }
      return true;
    });
  }
  if (course.courseCode === 'ID1050A') {
    // Keep only Wednesday lecture, plus all labs
    course.meetings = course.meetings.filter(m => {
      if (m.type === 'lecture') {
        return m.day === 'Wednesday';
      }
      return true;
    });
  }
  return course;
});

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Fixed extra lectures in CommonCourses.json');
