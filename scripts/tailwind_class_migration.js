const fs = require('fs');
const path = require('path');

const directories = [
  path.join(__dirname, '../admin'),
  path.join(__dirname, '../assets/js')
];

const replacements = [
  { pattern: /class=["']stat-grid([^"']*)["']/g, replace: 'class="grid grid-cols-2 gap-3 mb-4"' },
  { pattern: /class=["']stat-card([^"']*)["']/g, replace: 'class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col"' },
  { pattern: /class=["']admin-order-row([^"']*)["']/g, replace: 'class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3 hover:border-brand transition-colors cursor-pointer"' },
  { pattern: /class=["']btn-add-big([^"']*)["']/g, replace: 'class="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"' },
  { pattern: /class=["']btn([^"']*)["']/g, replace: 'class="bg-brand text-white px-3 py-2 rounded-lg font-bold shadow-sm hover:bg-brand-dark transition-colors inline-flex items-center justify-center gap-2 text-sm"' },
  { pattern: /class=["']form-group([^"']*)["']/g, replace: 'class="mb-4"' },
  { pattern: /class=["']form-label([^"']*)["']/g, replace: 'class="block text-sm font-semibold text-gray-700 mb-1"' },
  { pattern: /class=["']form-input([^"']*)["']/g, replace: 'class="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand transition-all outline-none"' },
  { pattern: /class=["']empty([^"']*)["']/g, replace: 'class="flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-gray-200 border-dashed"' },
  { pattern: /class=["']empty-icon([^"']*)["']/g, replace: 'class="text-4xl text-gray-300 mb-3"' },
  { pattern: /class=["']empty-title([^"']*)["']/g, replace: 'class="text-gray-500 font-medium"' },
  { pattern: /class=["']page-header([^"']*)["']/g, replace: 'class="flex justify-between items-center mb-6"' },
  { pattern: /class=["']page-title([^"']*)["']/g, replace: 'class="text-2xl font-extrabold text-gray-800"' },
  { pattern: /class=["']lucide-icon inline-icon([^"']*)["']/g, replace: 'class="w-5 h-5"' },
  { pattern: /class=["']lucide-icon([^"']*)["']/g, replace: 'class="w-5 h-5"' },
  { pattern: /class=["']toast([^"']*)["']/g, replace: 'class="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium opacity-0 transition-opacity pointer-events-none z-50"' },
  { pattern: /class=["']toast show([^"']*)["']/g, replace: 'class="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium opacity-100 transition-opacity z-50"' },
  // Remove emojis and replace with generic lucide icons if they exist in text
  { pattern: /<span>🎟️<\/span>/g, replace: '<i data-lucide="ticket" class="w-5 h-5"></i>' },
  { pattern: /👨‍🍳/g, replace: '' },
  { pattern: /✅/g, replace: '' },
  { pattern: /🎉/g, replace: '' },
];

directories.forEach(dir => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (file.endsWith('.html') || file.endsWith('.js')) {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      replacements.forEach(({ pattern, replace }) => {
        if (pattern.test(content)) {
          content = content.replace(pattern, replace);
          modified = true;
        }
      });
      
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated classes in ${file}`);
      }
    }
  });
});
