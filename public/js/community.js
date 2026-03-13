async function auth() {
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    window.location.assign('/auth/discord');
}

async function logout() {
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    try {
        await fetch('/logout', {
            method: 'GET'
        });
        checkDiscordAuth();
    } catch(error) {
        checkDiscordAuth();
    }
    
}

async function checkDiscordAuth() {
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    const pannel = document.getElementById('panno');
    const note = document.getElementById('guild_note');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    try {
        const res = await fetch('/api/me', {
            method: 'GET'
        });
        const json = await res.json();
        console.log("get user", json);
        if (progress) progress.classList.add("hidden");
        if (json.authenticated) {
            if (logoutBtn) logoutBtn.classList.remove("hidden");
            if (submitBtn) submitBtn.classList.add("hidden");
            if (json.user && json.user.inTargetGuild) {
                if (pannel) pannel.classList.remove("hidden");
                if (note) note.textContent = '';
            } else {
                if (pannel) pannel.classList.add("hidden");
                if (note) note.textContent = 'You are not a member of the GenLayer community.';
            }
        } else {
            if (pannel) pannel.classList.add("hidden");
            if (logoutBtn) logoutBtn.classList.add("hidden");
            if (submitBtn) submitBtn.classList.remove("hidden");
            if (note) note.textContent = '';
        }
    } catch(error) {
        if (progress) progress.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
        if (submitBtn) submitBtn.classList.remove("hidden");
        if (note) note.textContent = '';
    }
    
}

export {
    auth,
    logout,
    checkDiscordAuth
};