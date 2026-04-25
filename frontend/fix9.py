
with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

index = text.find('{sefirot.map((node) => {')
if index != -1:
    end_index = text.find('style={{', index)
    if end_index != -1:
        chunk = text[index:end_index]
        
        # Inject state variables
        chunk = chunk.replace('return (', 'const isSelected = filterSefira === node.id;\n              const isOtherSelected = filterSefira !== null && !isSelected;\n              return (')
        
        # Inject onClick
        chunk = chunk.replace('<div', '<div onClick={() => setFilterSefira(prev => prev === node.id ? null : node.id)}')
        
        # Inject classes
        chunk = chunk.replace('\}', ' cursor-pointer transition-all hover:scale-105 z-10  }')
        
        new_text = text[:index] + chunk + text[end_index:]
        with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
            f.write(new_text)
        print('Fixed manually!')

else:
    print('Failed to find chunk')

