
with open('src/CalendarModule.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

import re

regex = r'(\{sefirot\.map\(\(node\) => \{[\s\S]{1,200}const size = 52 \+ scale \* 38;\s*return \(\s*<div\s*key=\{node\.id\}\s*className=\{[^]+\})'

def replacer(match):
    original = match.group(1)
    
    # We inject the new logic right before return (
    injection = '''              const isSelected = filterSefira === node.id;
              const isOtherSelected = filterSefira !== null && !isSelected;
              return ('''
    
    mod1 = re.sub(r'return \(\s*<div', injection + '''
                <div
                  onClick={() => setFilterSefira(prev => prev === node.id ? null : node.id)}''', original)
    
    # modify className
    mod2 = re.sub(r'className=\{([^]+)\}', r'className={\1 cursor-pointer transition-all hover:scale-105 z-10  }', mod1)
    
    return mod2


new_text, count = re.subn(regex, replacer, text)
print('Replaced:', count)
if count > 0:
    with open('src/CalendarModule.tsx', 'w', encoding='utf-8') as f:
        f.write(new_text)


