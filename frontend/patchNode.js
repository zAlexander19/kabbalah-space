
const fs = require('fs');
let code = fs.readFileSync('src/CalendarModule.tsx', 'utf8');

const regex = /\{sefirot\.map\(\(node\) => \{[\s\S]*?className=\{bsolute rounded-full flex flex-col items-center[\s\S]*?\$\{node\.colorClass\}\}/;

const replacement = \{sefirot.map((node) => {
              const item = volumeMap[node.id];
              const activityCount = item?.actividades_total ?? 0;
              const scale = activityCount / maxActivityCount;
              const size = 52 + scale * 38;
              const isSelected = filterSefira === node.id;
              const isOtherSelected = filterSefira !== null && !isSelected;
              return (
                <div
                  key={node.id}
                  onClick={() => setFilterSefira(prev => prev === node.id ? null : node.id)}
                  className={\\\\\bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)] \ cursor-pointer transition-all hover:scale-105 z-10 \ \\\\\\}\;

code = code.replace(regex, replacement);
fs.writeFileSync('src/CalendarModule.tsx', code);
console.log('Done replacement');

