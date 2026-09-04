// Theme initialization to prevent flash
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme !== 'light') {
        document.documentElement.classList.add('dark-theme');
    }
})();
