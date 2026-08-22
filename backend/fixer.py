with open('generate_final_report_extended.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('\\\"\"\"', '\"\"\"')
text = text.replace('\\n', '\n')

with open('generate_final_report_extended.py', 'w', encoding='utf-8') as f:
    f.write(text)
