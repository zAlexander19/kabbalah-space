
with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add filterSefira state
if 'const [filterSefira, setFilterSefira]' not in text:
    text = text.replace('const [isPanelOpen, setIsPanelOpen] = useState(false);', 'const [isPanelOpen, setIsPanelOpen] = useState(false);\n    const [filterSefira, setFilterSefira] = useState<string | null>(null);')

# 2. Filter activities
old_events = '''  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const realEvents: CalendarEvent[] = activities.map((activity) => ({'''
new_events = '''  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const filtered = filterSefira ? activities.filter(a => a.sefirot.some(s => s.id === filterSefira)) : activities;
    const realEvents: CalendarEvent[] = filtered.map((activity) => ({'''
text = text.replace(old_events, new_events)

# 3. Update dependencies
old_deps = 'title, selectedSefirot]);'
new_deps = 'title, selectedSefirot, filterSefira]);'
text = text.replace(old_deps, new_deps)

# 4. Make tree clickable
old_node = '''            {sefirot.map((node) => {
              const item = volumeMap[node.id];
              const activityCount = item?.actividades_total ?? 0;
              const scale = activityCount / maxActivityCount;
              const size = 52 + scale * 38;
              return (
                <div
                  key={node.id}
                  className={bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)] }
                  style={{'''

new_node = '''            {sefirot.map((node) => {
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
                  className={bsolute rounded-full flex flex-col items-center justify-center text-center border border-white/30 shadow-[0_0_20px_rgba(0,0,0,0.35)]  cursor-pointer transition-transform hover:scale-105  }
                  style={{'''

text = text.replace(old_node, new_node)

with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')

