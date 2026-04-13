const fs = require('fs');
let code = fs.readFileSync('src/CalendarModule.tsx', 'utf8');

const regex = /const handleSelectSlot = \(\{ start, end \}: \{ start: Date; end: Date \}\) => \{/;

const replacement = `const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    const overlappingActivity = activities.find(act => {
      const actStart = new Date(act.inicio);
      const actEnd = new Date(act.fin);
      return actStart < end && actEnd > start;
    });

    if (overlappingActivity) {
      editActivity(overlappingActivity);
      return;
    }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/CalendarModule.tsx', code);
console.log("Replaced handleSelectSlot successfully");