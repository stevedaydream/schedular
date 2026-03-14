import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/schedule'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/schedule',
    name: 'Schedule',
    component: () => import('../views/ScheduleView.vue'),
    meta: { requiresAuth: true, roles: ['scheduler', 'superadmin'] }
  },
  {
    path: '/schedule/view',
    name: 'ScheduleRead',
    component: () => import('../views/ScheduleReadView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/request',
    name: 'Request',
    component: () => import('../views/RequestView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/swap',
    name: 'Swap',
    component: () => import('../views/SwapView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('../views/NotificationsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAuth: true, roles: ['superadmin'] }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('authToken')
  const userStr = localStorage.getItem('authUser')

  // Allow public routes without auth
  if (to.meta.public) {
    if (token && to.path === '/login') {
      return next('/schedule')
    }
    return next()
  }

  // Require auth for protected routes
  if (to.meta.requiresAuth && !token) {
    return next('/login')
  }

  // Role-based access control
  if (to.meta.roles && userStr) {
    try {
      const user = JSON.parse(userStr)
      if (!to.meta.roles.includes(user.role)) {
        // Redirect non-schedulers from /schedule to /schedule/view
        if (to.path === '/schedule') {
          return next('/schedule/view')
        }
        // Redirect non-admins from /admin
        if (to.path === '/admin') {
          return next('/schedule/view')
        }
        return next('/schedule/view')
      }
    } catch {
      return next('/login')
    }
  }

  next()
})

export default router
