// Check if user is authenticated on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    setupEventListeners();
});

// Check if user is logged in
async function checkAuthentication() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();

        if (data.authenticated) {
            // User is logged in, show appropriate dashboard
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                localStorage.setItem('isAdmin', data.isAdmin);
                // Redirect admin to admin dashboard
                if (data.user.username === 'admin') {
                    window.location.href = '/admin-dashboard.html';
                } else {
                    window.location.href = '/upload-dashboard.html';
                }
            }
            initializeDashboard(data.user, data.isAdmin);
        } else {
            // User is not logged in, show login
            if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
                window.location.href = '/index.html';
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Setup event listeners for login page
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });

    // Upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', handleUpload);
    }

    // Add user button
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', handleAddUser);
    }

    // Update password button
    const updatePasswordBtn = document.getElementById('updatePasswordBtn');
    if (updatePasswordBtn) {
        updatePasswordBtn.addEventListener('click', handleUpdatePassword);
    }
}

// ===== LOGIN HANDLING =====
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const successDiv = document.getElementById('loginSuccess');

    // Clear previous messages
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            successDiv.textContent = data.message;
            successDiv.style.display = 'block';
            localStorage.setItem('currentUser', JSON.stringify({ username }));
            setTimeout(() => {
                // Redirect admin to admin dashboard
                if (username === 'admin') {
                    window.location.href = '/admin-dashboard.html';
                } else {
                    window.location.href = '/upload-dashboard.html';
                }
            }, 1500);
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'An error occurred. Please try again.';
        errorDiv.style.display = 'block';
        console.error('Login error:', error);
    }
}

// ===== LOGOUT HANDLING =====
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        if (response.ok) {
            window.location.href = '/index.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ===== DASHBOARD INITIALIZATION =====
function initializeDashboard(user, isAdmin) {
    // Store user and admin status in localStorage
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('isAdmin', isAdmin);
    
    // Set user display
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        userDisplay.textContent = `Welcome, ${user.username}!`;
    }

    // Hide admin-only elements for non-admin users
    if (!isAdmin) {
        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.style.display = 'none';
        });
    }

    // Only load data if elements exist on this page
    if (document.getElementById('documentsBody')) {
        loadDocuments();
    }

    if (document.getElementById('usersList')) {
        loadUsers();
    }
}

// ===== TAB SWITCHING =====
function switchTab(tabName) {
    // Hide all tabs
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Add active class to clicked button
    event.target.classList.add('active');

    // Reload documents when switching to view tab
    if (tabName === 'view') {
        loadDocuments();
    }
}

// ===== UPLOAD HANDLING =====
async function handleUpload() {
    const uploadPassword = document.getElementById('uploadPassword').value;
    const documentFile = document.getElementById('documentFile').files[0];
    const description = document.getElementById('documentDescription')?.value || '';
    const messageDiv = document.getElementById('uploadMessage');

    messageDiv.className = 'message-box';
    messageDiv.classList.remove('show');

    if (!uploadPassword) {
        messageDiv.textContent = 'Please enter the upload password';
        messageDiv.classList.add('error', 'show');
        return;
    }

    if (!documentFile) {
        messageDiv.textContent = 'Please select a document to upload';
        messageDiv.classList.add('error', 'show');
        return;
    }

    // Validate file type
    const validTypes = [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!validTypes.includes(documentFile.type) && 
        !documentFile.name.endsWith('.doc') && 
        !documentFile.name.endsWith('.docx')) {
        messageDiv.textContent = 'Please select a valid Word document (.doc or .docx)';
        messageDiv.classList.add('error', 'show');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('document', documentFile);
        formData.append('uploadPassword', uploadPassword);
        formData.append('description', description);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.textContent = 'Document uploaded successfully!';
            messageDiv.classList.add('success', 'show');
            document.getElementById('uploadPassword').value = '';
            document.getElementById('documentFile').value = '';
            setTimeout(() => {
                messageDiv.classList.remove('show');
            }, 3000);
        } else {
            messageDiv.textContent = data.error || 'Upload failed';
            messageDiv.classList.add('error', 'show');
        }
    } catch (error) {
        messageDiv.textContent = 'An error occurred during upload';
        messageDiv.classList.add('error', 'show');
        console.error('Upload error:', error);
    }
}

// ===== LOAD DOCUMENTS =====
async function loadDocuments() {
    try {
        const response = await fetch('/api/documents');
        const documents = await response.json();

        const tbody = document.getElementById('documentsBody');
        if (!tbody) return; // Element doesn't exist on this page

        if (!documents || documents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No documents uploaded yet</td></tr>';
            return;
        }

        const isAdmin = localStorage.getItem('isAdmin') === 'true';

        tbody.innerHTML = documents.map((doc, index) => {
            const uploadDate = new Date(doc.uploaded_at).toLocaleDateString();
            const fileSize = (doc.size / 1024).toFixed(2) + ' KB';
            const deleteBtn = isAdmin ? `<button class="btn-small btn-delete" onclick="deleteDocument(${doc.id})">Delete</button>` : '';

            return `
                <tr>
                    <td>${escapeHtml(doc.originalname)}</td>
                    <td>${fileSize}</td>
                    <td>${escapeHtml(doc.uploaded_by)}</td>
                    <td>${uploadDate}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-small btn-download" onclick="downloadDocument('${doc.filename}', '${escapeHtml(doc.originalname)}')">Download</button>
                            ${deleteBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading documents:', error);
        const tbody = document.getElementById('documentsBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading documents</td></tr>';
        }
    }
}

// ===== DOWNLOAD DOCUMENT =====
async function downloadDocument(filename, originalname) {
    try {
        const response = await fetch(`/api/download?filename=${encodeURIComponent(filename)}`);        
        if (!response.ok) {
            alert('Download failed');
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = originalname;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
    } catch (error) {
        console.error('Download error:', error);
        alert('An error occurred during download');
    }
}

// ===== DELETE DOCUMENT =====
async function deleteDocument(docId) {
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    if (!isAdmin) {
        alert('Only admin can delete documents');
        return;
    }

    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            alert('Document deleted successfully');
            loadDocuments();
        } else {
            alert(data.error || 'Delete failed');
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('An error occurred during deletion');
    }
}

// ===== USER MANAGEMENT =====
async function handleAddUser() {
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    const messageDiv = document.getElementById('userMessage');

    messageDiv.className = 'message-box';
    messageDiv.classList.remove('show');

    if (!isAdmin) {
        messageDiv.textContent = 'Only admin can create users';
        messageDiv.classList.add('error', 'show');
        return;
    }

    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newUserPassword').value;

    if (!username || !password) {
        messageDiv.textContent = 'Please enter username and password';
        messageDiv.classList.add('error', 'show');
        return;
    }

    if (password.length < 4) {
        messageDiv.textContent = 'Password must be at least 4 characters';
        messageDiv.classList.add('error', 'show');
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.textContent = 'User added successfully!';
            messageDiv.classList.add('success', 'show');
            document.getElementById('newUsername').value = '';
            document.getElementById('newUserPassword').value = '';
            setTimeout(() => {
                messageDiv.classList.remove('show');
                loadUsers();
            }, 2000);
        } else {
            messageDiv.textContent = data.error || 'Failed to add user';
            messageDiv.classList.add('error', 'show');
        }
    } catch (error) {
        messageDiv.textContent = 'An error occurred';
        messageDiv.classList.add('error', 'show');
        console.error('Add user error:', error);
    }
}

// ===== LOAD USERS =====
function loadUsers() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return; // Element doesn't exist on this page
    
    // This is a demo - in a real app, fetch from server
    const userName = document.getElementById('userDisplay');
    
    const username = userName ? userName.textContent.replace('Welcome, ', '').replace('!', '') : 'User';
    
    usersList.innerHTML = `
        <li>👤 ${escapeHtml(username)} (Current User)</li>
        <li>👤 admin (System Administrator)</li>
    `;
}

// ===== UPDATE UPLOAD PASSWORD =====
async function handleUpdatePassword() {
    const newPassword = document.getElementById('newUploadPassword').value;
    const messageDiv = document.getElementById('settingsMessage');

    messageDiv.className = 'message-box';
    messageDiv.classList.remove('show');

    if (!newPassword || newPassword.length < 4) {
        messageDiv.textContent = 'Password must be at least 4 characters';
        messageDiv.classList.add('error', 'show');
        return;
    }

    try {
        const response = await fetch('/api/settings/update-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.textContent = 'Upload password updated successfully!';
            messageDiv.classList.add('success', 'show');
            document.getElementById('newUploadPassword').value = '';
            setTimeout(() => {
                messageDiv.classList.remove('show');
            }, 3000);
        } else {
            messageDiv.textContent = data.error || 'Failed to update password';
            messageDiv.classList.add('error', 'show');
        }
    } catch (error) {
        messageDiv.textContent = 'An error occurred';
        messageDiv.classList.add('error', 'show');
        console.error('Update password error:', error);
    }
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle Enter key on login form
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin(e);
            }
        });
    }
});
