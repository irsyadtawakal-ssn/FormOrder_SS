const fs = require('fs');
const path = require('path');

const utilsPath = path.join(__dirname, '../assets/js/utils.js');

const observerCode = `
// Auto-init Lucide icons when DOM changes
if (typeof window !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
      
      const observer = new MutationObserver((mutations) => {
        let shouldRender = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            shouldRender = true;
            break;
          }
        }
        if (shouldRender) {
          lucide.createIcons();
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
}
`;

fs.appendFileSync(utilsPath, observerCode);
console.log('Observer appended to utils.js');
