
with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1.
if 'const [filterSefira, setFilterSefira]' not in text:
    text = text.replace('const [isPanelOpen, setIsPanelOpen] = useState(false);', 'const [isPanelOpen, setIsPanelOpen] = useState(false);\n    const [filterSefira, setFilterSefira] = useState<string | null>(null);')

# 2.
text = text.replace('  const calendarEvents = useMemo<CalendarEvent[]>(() => {\n    const realEvents: CalendarEvent[] = activities.map((activity) => ({', '  const calendarEvents = useMemo<CalendarEvent[]>(() => {\n    const filtered = filterSefira ? activities.filter(a => a.sefirot.some(s => s.id === filterSefira)) : activities;\n    const realEvents: CalendarEvent[] = filtered.map((activity) => ({')

# 3.
text = text.replace('title, selectedSefirot]);', 'title, selectedSefirot, filterSefira]);')

# 4.
index = text.find('{sefirot.map((node) => {')
end = text.find('style={{', index)

if index != -1 and end != -1:
    chunk = '''{sefirot.map((node) => {
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
                  className={bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)]  cursor-pointer transition-all hover:scale-105 z-10  }
                  '''
    text = text[:index] + chunk + text[end:]

with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Success Python')

