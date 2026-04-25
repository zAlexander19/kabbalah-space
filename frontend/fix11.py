
with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

index = text.find('{sefirot.map((node) => {')
end_index = text.find('style={{', index)

if index != -1 and end_index != -1:
    correct_chunk = '''{sefirot.map((node) => {
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
                  style={{'''
    
    new_text = text[:index] + correct_chunk + text[end_index+8:]
    with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
        f.write(new_text)
    print('Fixed perfectly')

