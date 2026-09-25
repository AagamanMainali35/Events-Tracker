import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Attach Authorization Bearer token to all outgoing requests if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Intercept 401s to handle token expiration
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Token is expired or invalid
            // We keep localStorage for user convenience or dispatch auth event
        }
        return Promise.reject(error);
    }
);

// --- Auth Endpoints ---
export async function loginUser(email, password) {
    const res = await api.post('/login', { email, password });
    if (res.data.access_token) {
        localStorage.setItem('access_token', res.data.access_token);
        if (res.data.refresh_token) {
            localStorage.setItem('refresh_token', res.data.refresh_token);
        }
    }
    return res.data;
}

export async function registerUser(email, username, password) {
    const res = await api.post('/register', { email, username, password });
    if (res.data.access_token) {
        localStorage.setItem('access_token', res.data.access_token);
        if (res.data.refresh_token) {
            localStorage.setItem('refresh_token', res.data.refresh_token);
        }
    }
    return res.data;
}

export async function getMe() {
    const res = await api.get('/me');
    return res.data;
}

export function logoutUser() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
}

// --- Events Endpoints ---
export async function fetchEventsApi(params = {}) {
    const query = {};
    if (params.page) query.page = params.page;
    if (params.limit) query.limit = params.limit;
    if (params.event_type && params.event_type !== 'all') query.event_type = params.event_type;
    if (params.search && params.search.trim()) query.search = params.search.trim();
    if (params.start_date) query.start_date = params.start_date;
    if (params.end_date) query.end_date = params.end_date;
    if (params.user_id) query.user_id = params.user_id;

    const res = await api.get('/api/events', { params: query });
    return res.data;
}

export async function fetchAnalyticsApi() {
    const res = await api.get('/api/events/analytics');
    return res.data;
}

export async function createEventApi(eventData) {
    const res = await api.post('/api/events', eventData);
    return res.data;
}
