// Initialize Telegram WebApp
const tgApp = window.Telegram.WebApp;
tgApp.expand(); // Expand the WebApp to take the full screen height

// Apply Telegram theme variables if available
if (tgApp.colorScheme === 'dark') {
    document.documentElement.classList.add('dark');
}

// DOM Elements
const userNameElement = document.getElementById('userName');
const userIdElement = document.getElementById('userId');
const userAvatarElement = document.getElementById('userAvatar');
const userBalanceElement = document.getElementById('userBalance');
const tasksCompletedElement = document.getElementById('tasksCompleted');
const withdrawAmountInput = document.getElementById('withdrawAmount');
const withdrawBtn = document.getElementById('withdrawBtn');
const activityListElement = document.getElementById('activityList');
const taskCards = document.querySelectorAll('.task-card');

// User data
let userData = {
    id: null,
    name: null,
    balance: 0,
    tasksCompleted: 0,
    lastTaskCompletionTime: {}
};

// Initialize the app
async function initApp() {
    // Check if Telegram WebApp is available
    if (!tgApp || !tgApp.initDataUnsafe || !tgApp.initDataUnsafe.user) {
        showToast('Error: This app must be opened from Telegram');
        return;
    }

    // Get user data from Telegram WebApp
    const tgUser = tgApp.initDataUnsafe.user;
    userData.id = tgUser.id.toString();
    userData.name = tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '');

    // Update UI with user info
    userNameElement.textContent = userData.name;
    userIdElement.textContent = 'ID: ' + userData.id;
    userAvatarElement.textContent = userData.name.charAt(0);

    // Check if user exists in Supabase
    try {
        await loadUserData();
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading data. Please try again.');
    }

    // Add event listeners
    taskCards.forEach(card => {
        card.addEventListener('click', () => completeTask(card));
    });
    
    withdrawBtn.addEventListener('click', submitWithdrawal);

    // Load activity history
    loadActivityHistory();
    
    // Check task availability
    checkTaskAvailability();
}

// Load user data from Supabase
async function loadUserData() {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is the error code for no rows returned
        throw error;
    }
    
    if (user) {
        // User exists, load their data
        userData.balance = user.balance || 0;
        userData.tasksCompleted = user.tasksCompleted || 0;
        userData.lastTaskCompletionTime = user.lastTaskCompletionTime || {};
    } else {
        // New user, create record
        const { error: insertError } = await supabase
            .from('users')
            .insert({
                id: userData.id,
                name: userData.name,
                balance: 0,
                tasksCompleted: 0,
                lastTaskCompletionTime: {},
                createdAt: new Date().toISOString()
            });
            
        if (insertError) throw insertError;
    }

    // Update UI
    updateUserStats();
}

// Update user stats in the UI
function updateUserStats() {
    userBalanceElement.textContent = userData.balance;
    tasksCompletedElement.textContent = userData.tasksCompleted;
}

// Check task availability based on cooldowns
function checkTaskAvailability() {
    const now = new Date().getTime();
    
    taskCards.forEach(card => {
        const taskType = card.getAttribute('data-task-type');
        const lastCompletion = userData.lastTaskCompletionTime[taskType] || 0;
        
        let cooldownMs = 0;
        let cooldownText = '';
        
        // Set cooldown periods for different task types
        switch(taskType) {
            case 'quick':
                cooldownMs = 5 * 60 * 1000; // 5 minutes
                cooldownText = '5 minutes';
                break;
            case 'daily':
                cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
                cooldownText = '24 hours';
                break;
            case 'special':
                cooldownMs = 48 * 60 * 60 * 1000; // 48 hours
                cooldownText = '48 hours';
                break;
            case 'custom': // Custom task type
                cooldownMs = 12 * 60 * 60 * 1000; // 12 hours
                cooldownText = '12 hours';
                break;
        }
        
        const timeElapsed = now - lastCompletion;
        
        if (lastCompletion > 0 && timeElapsed < cooldownMs) {
            // Task is on cooldown
            const timeRemaining = cooldownMs - timeElapsed;
            const minutesRemaining = Math.ceil(timeRemaining / (60 * 1000));
            const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000));
            
            let cooldownRemaining = '';
            if (minutesRemaining < 60) {
                cooldownRemaining = `${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}`;
            } else {
                cooldownRemaining = `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`;
            }
            
            card.classList.add('disabled');
            card.querySelector('.task-details p').textContent = `Available in ${cooldownRemaining}`;
        } else {
            // Task is available
            card.classList.remove('disabled');
            
            // Reset task description based on type
            switch(taskType) {
                case 'quick':
                    card.querySelector('.task-details p').textContent = 'Complete a simple task';
                    break;
                case 'daily':
                    card.querySelector('.task-details p').textContent = 'Complete your daily task';
                    break;
                case 'special':
                    card.querySelector('.task-details p').textContent = 'Complete a special challenge';
                    break;
                case 'custom':
                    card.querySelector('.task-details p').textContent = 'Description of your task';
                    break;
            }
        }
    });
    
    // Check again in 1 minute
    setTimeout(checkTaskAvailability, 60 * 1000);
}

// Complete a task
async function completeTask(taskCard) {
    if (taskCard.classList.contains('disabled')) {
        showToast('This task is not available yet');
        return;
    }
    
    const taskType = taskCard.getAttribute('data-task-type');
    const reward = parseInt(taskCard.getAttribute('data-reward'));
    
    try {
        // Add visual feedback
        taskCard.classList.add('pulse');
        setTimeout(() => taskCard.classList.remove('pulse'), 600);
        
        // Update user data
        userData.balance += reward;
        userData.tasksCompleted += 1;
        userData.lastTaskCompletionTime[taskType] = new Date().getTime();
        
        // Update Supabase
        const { error: updateError } = await supabase
            .from('users')
            .update({
                balance: userData.balance,
                tasksCompleted: userData.tasksCompleted,
                lastTaskCompletionTime: userData.lastTaskCompletionTime
            })
            .eq('id', userData.id);
            
        if (updateError) throw updateError;
        
        // Add to activity history
        let taskName = '';
        switch(taskType) {
            case 'quick': taskName = 'Quick Task'; break;
            case 'daily': taskName = 'Daily Challenge'; break;
            case 'special': taskName = 'Special Task'; break;
            case 'custom': taskName = 'Your Custom Task'; break;
        }
        
        await addActivity(taskName, reward);
        
        // Update UI
        updateUserStats();
        showToast(`Task completed! Earned ${reward} points`);
        
        // Update task availability
        checkTaskAvailability();
        
    } catch (error) {
        console.error('Error completing task:', error);
        showToast('Error completing task. Please try again.');
    }
}

// Submit withdrawal request
async function submitWithdrawal() {
    const amount = parseInt(withdrawAmountInput.value);
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount');
        return;
    }
    
    if (amount > userData.balance) {
        showToast('Insufficient balance');
        return;
    }
    
    try {
        // Disable button during processing
        withdrawBtn.disabled = true;
        
        // Update user balance
        userData.balance -= amount;
        
        // Update Supabase
        const { error: updateError } = await supabase
            .from('users')
            .update({
                balance: userData.balance
            })
            .eq('id', userData.id);
            
        if (updateError) throw updateError;
        
        // Add withdrawal request to Supabase
        const { error: insertError } = await supabase
            .from('withdrawals')
            .insert({
                userId: userData.id,
                userName: userData.name,
                amount: amount,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            
        if (insertError) throw insertError;
        
        // Add to activity history
        await addActivity('Withdrawal Request', -amount);
        
        // Update UI
        updateUserStats();
        withdrawAmountInput.value = '';
        showToast('Withdrawal request submitted');
        
        // Re-enable button
        withdrawBtn.disabled = false;
    } catch (error) {
        console.error('Error submitting withdrawal:', error);
        showToast('Error submitting withdrawal. Please try again.');
        withdrawBtn.disabled = false;
    }
}

// Add activity to history
async function addActivity(type, amount) {
    try {
        const { error } = await supabase
            .from('activities')
            .insert({
                userId: userData.id,
                type: type,
                amount: amount,
                createdAt: new Date().toISOString()
            });
            
        if (error) throw error;
        
        // Refresh activity list
        loadActivityHistory();
    } catch (error) {
        console.error('Error adding activity:', error);
    }
}

// Load activity history
async function loadActivityHistory() {
    try {
        const { data: activities, error } = await supabase
            .from('activities')
            .select('*')
            .eq('userId', userData.id)
            .order('createdAt', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        
        // Clear current list
        activityListElement.innerHTML = '';
        
        if (!activities || activities.length === 0) {
            activityListElement.innerHTML = '<div class="activity-item">No activity yet</div>';
            return;
        }
        
        // Add activities to list
        activities.forEach(activity => {
            const date = new Date(activity.createdAt);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const amountClass = activity.amount > 0 ? 'positive' : 'negative';
            const amountPrefix = activity.amount > 0 ? '+' : '';
            
            // Choose icon based on activity type
            let icon = '';
            if (activity.type.includes('Quick')) {
                icon = '<i class="fas fa-bolt"></i>';
            } else if (activity.type.includes('Daily')) {
                icon = '<i class="fas fa-calendar-day"></i>';
            } else if (activity.type.includes('Special')) {
                icon = '<i class="fas fa-star"></i>';
            } else if (activity.type.includes('Custom')) {
                icon = '<i class="fas fa-trophy"></i>';
            } else if (activity.type.includes('Withdrawal')) {
                icon = '<i class="fas fa-wallet"></i>';
            } else {
                icon = '<i class="fas fa-check-circle"></i>';
            }
            
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            activityItem.innerHTML = `
                <div class="activity-title">${icon} ${activity.type}</div>
                <div class="activity-details">
                    <span>${formattedDate}</span>
                    <span class="activity-amount ${amountClass}">${amountPrefix}${activity.amount}</span>
                </div>
            `;
            
            activityListElement.appendChild(activityItem);
        });
    } catch (error) {
        console.error('Error loading activities:', error);
    }
}

// Show toast notification
function showToast(message) {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', initApp);