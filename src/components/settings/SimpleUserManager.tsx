import React, { useState, useEffect } from 'react'
import { UserPlus, Trash2, Key, Lock, Unlock, UserCheck, UserX, Clock, Shield, User as UserIcon, ArrowRight } from 'lucide-react'
import { userManagementService } from '@/services/userManagementService'
import { userProfileService } from '@/services/userProfileService'
import { PasswordDebugger } from '@/utils/passwordDebug'
import { generalToast } from '@/services/generalToastService'
import { useConfirmation } from '@/components/common/ConfirmationModal'

interface User {
  id: string
  name: string
  email: string
  role: string
  isLocked?: boolean
  isActive?: boolean
  lastLogin?: string
  created_at?: string
}

export const SimpleUserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState<string | null>(null)
  const { confirm, ConfirmationDialog } = useConfirmation()

  // Helper function to format last login with both date and time
  const formatLastLogin = (dateString: string | undefined) => {
    if (!dateString) return 'Never'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return 'Never'
      const dateStr = date.toLocaleDateString()
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return `${dateStr} at ${timeStr}`
    } catch (error) {
      return 'Never'
    }
  }

  // Helper function to determine if a user is the first super user (cannot be demoted)
  const isFirstSuperUser = (user: User): boolean => {
    if (user.role !== 'super_user') return false

    // Find the earliest created super user
    const superUsers = users.filter(u => u.role === 'super_user' && u.created_at)
    if (superUsers.length === 0) return false

    const earliestSuperUser = superUsers.reduce((earliest, current) => {
      const earliestTime = new Date(earliest.created_at!).getTime()
      const currentTime = new Date(current.created_at!).getTime()
      return currentTime < earliestTime ? current : earliest
    })

    return user.id === earliestSuperUser.id
  }

  // New user form
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user'
  })

  // Password change form
  const [newPassword, setNewPassword] = useState('')

  // Load users on mount
  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      console.log('🔍 DEBUG: Loading users from userManagementService...')
      const response = await userManagementService.loadSystemUsers()
      console.log('📊 DEBUG: userManagementService response:', response)

      if (response.status === 'success' && response.data) {
        console.log(`✅ DEBUG: Loaded ${response.data.length} users from service`)

        const mappedUsers = response.data.map(u => {
          const mapped = {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            // Ensure specific users are never shown as locked
            isLocked: (u.email?.toLowerCase() === 'elmfarrell@yahoo.com' ||
                       u.email?.toLowerCase() === 'pierre@phaetonai.com' ||
                       u.email?.toLowerCase() === 'demo@medex.com' ||
                       u.email?.toLowerCase() === 'guest@email.com') ? false : (u.isLocked || false),
            isActive: u.isActive !== undefined ? u.isActive : true, // Default to true for existing users
            lastLogin: u.lastLogin,
            created_at: (u as any).created_at // Include creation timestamp to identify first user
          }
          console.log(`👤 DEBUG: User ${u.email} - isActive: ${mapped.isActive} (original: ${u.isActive})`)
          return mapped
        })

        setUsers(mappedUsers)
        console.log('✅ DEBUG: Set users state with', mappedUsers.length, 'users')
      }
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      generalToast.warning('Please fill in all fields', 'Missing Information')
      return
    }

    setIsLoading(true)
    try {
      // Create user using the same method as programmatic creation
      const userData = {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role as any,
        mfa_enabled: false,
        isActive: false, // New users start in pending status and require approval
        settings: {}
      }

      const credentials = {
        email: newUser.email,
        password: newUser.password,
        tempPassword: false
      }

      const response = await userManagementService.createSystemUser(userData, credentials)

      if (response.status === 'success') {
        generalToast.success(`User ${newUser.email} created successfully! Account is pending approval.`, 'User Created')
        setShowAddUser(false)
        setNewUser({ name: '', email: '', password: '', role: 'user' })
        await loadUsers()
      } else {
        generalToast.error(`Failed to create user: ${response.error}`, 'Creation Failed')
      }
    } catch (error: any) {
      generalToast.error(`Error creating user: ${error.message}`, 'Error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async (userId: string, email: string) => {
    if (!newPassword) {
      generalToast.warning('Please enter a new password', 'Missing Password')
      return
    }

    setIsLoading(true)
    try {
      // Use the PasswordDebugger method that we know works
      await PasswordDebugger.setUserPassword(userId, email, newPassword)
      generalToast.success(`Password changed successfully for ${email}`, 'Password Updated')
      setShowChangePassword(null)
      setNewPassword('')
    } catch (error: any) {
      generalToast.error(`Failed to change password: ${error.message}`, 'Password Change Failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Are you sure you want to delete ${email}?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    setIsLoading(true)
    try {
      const response = await userManagementService.deleteSystemUser(userId)
      if (response.status === 'success') {
        generalToast.success(`User ${email} deleted successfully`, 'User Deleted')
        await loadUsers()
      } else {
        generalToast.error(`Failed to delete user: ${response.error}`, 'Delete Failed')
      }
    } catch (error: any) {
      generalToast.error(`Error deleting user: ${error.message}`, 'Error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlockUser = async (userId: string, email: string) => {
    setIsLoading(true)
    try {
      await userManagementService.clearAccountLockout(userId)
      generalToast.success(`Account ${email} unlocked successfully`, 'Account Unlocked')
      await loadUsers()
    } catch (error: any) {
      generalToast.error(`Failed to unlock account: ${error.message}`, 'Unlock Failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisableUser = async (userId: string, email: string) => {
    // Prevent disabling super users and demo users
    if (email.toLowerCase() === 'elmfarrell@yahoo.com' ||
        email.toLowerCase() === 'pierre@phaetonai.com' ||
        email.toLowerCase() === 'demo@medex.com' ||
        email.toLowerCase() === 'guest@email.com') {
      generalToast.warning('Cannot disable super users or demo accounts', 'Action Not Allowed')
      return
    }

    const confirmed = await confirm({
      title: 'Disable User',
      message: `Are you sure you want to disable ${email}?\n\nThey will not be able to log in until their account is re-enabled.`,
      type: 'warning',
      confirmText: 'Disable',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    setIsLoading(true)
    try {
      await userManagementService.disableUser(userId, 'Disabled by super user')
      generalToast.success(`Account ${email} disabled successfully`, 'Account Disabled')
      await loadUsers()
    } catch (error: any) {
      generalToast.error(`Failed to disable account: ${error.message}`, 'Disable Failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleRole = async (user: User) => {
    // Check if trying to demote the first super user
    if (user.role === 'super_user' && isFirstSuperUser(user)) {
      generalToast.error(
        'Cannot demote the first Super User. This account must remain as Super User to ensure system administration is always possible.',
        'Action Not Allowed'
      )
      return
    }

    const newRole = user.role === 'super_user' ? 'user' : 'super_user'
    const isPromoting = newRole === 'super_user'
    const currentRoleText = user.role === 'super_user' ? 'Super User' : 'User'
    const newRoleText = isPromoting ? 'Super User' : 'User'

    const confirmed = await confirm({
      title: isPromoting ? '✨ Promote to Super User' : '⬇️ Demote to User',
      message: '', // Will use richContent instead
      type: isPromoting ? 'success' : 'warning',
      confirmText: isPromoting ? 'Promote User' : 'Demote User',
      cancelText: 'Cancel',
      customIcon: (
        <div className={`relative flex items-center justify-center w-20 h-20 rounded-full ${
          isPromoting
            ? 'bg-gradient-to-br from-blue-500 to-purple-600'
            : 'bg-gradient-to-br from-amber-500 to-orange-600'
        } shadow-lg`}>
          {isPromoting ? (
            <Shield className="w-10 h-10 text-white" strokeWidth={2.5} />
          ) : (
            <UserIcon className="w-10 h-10 text-white" strokeWidth={2.5} />
          )}
        </div>
      ),
      richContent: (
        <div className="space-y-4">
          {/* User name */}
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {user.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {user.email}
          </p>

          {/* Role transition visualization */}
          <div className="flex items-center justify-center gap-3 py-4">
            {/* Current role */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              user.role === 'super_user'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
              {user.role === 'super_user' ? (
                <Shield className="w-4 h-4" />
              ) : (
                <UserIcon className="w-4 h-4" />
              )}
              <span className="font-medium text-sm">{currentRoleText}</span>
            </div>

            {/* Arrow */}
            <ArrowRight className={`w-5 h-5 ${
              isPromoting
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-amber-600 dark:text-amber-400'
            }`} />

            {/* New role */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isPromoting
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-2 ring-amber-500'
            }`}>
              {isPromoting ? (
                <Shield className="w-4 h-4" />
              ) : (
                <UserIcon className="w-4 h-4" />
              )}
              <span className="font-medium text-sm">{newRoleText}</span>
            </div>
          </div>

          {/* Description */}
          <div className={`p-3 rounded-lg ${
            isPromoting
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : 'bg-amber-50 dark:bg-amber-900/20'
          }`}>
            <p className={`text-sm ${
              isPromoting
                ? 'text-blue-800 dark:text-blue-200'
                : 'text-amber-800 dark:text-amber-200'
            }`}>
              {isPromoting ? (
                <>
                  <strong>Super Users</strong> have full administrative access, including user management,
                  API configuration, and audit log viewing.
                </>
              ) : (
                <>
                  <strong>Regular Users</strong> have standard access without administrative privileges.
                  They cannot manage users or access sensitive settings.
                </>
              )}
            </p>
          </div>

          {/* Confirmation text */}
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 pt-2">
            Are you sure you want to {isPromoting ? 'promote' : 'demote'} this user?
          </p>
        </div>
      )
    })

    if (!confirmed) return

    setIsLoading(true)
    try {
      console.log(`🔄 Changing role for ${user.email} from ${user.role} to ${newRole}`)

      // Update user profile with new role
      const updateResponse = await userProfileService.updateUserProfile(user.id, { role: newRole })

      if (updateResponse.status === 'success') {
        // Update UI state directly
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.id === user.id
              ? { ...u, role: newRole }
              : u
          )
        )

        generalToast.success(
          `${user.name} is now a ${newRoleText}`,
          'Role Updated'
        )
      } else {
        generalToast.error(`Failed to update role: ${updateResponse.error}`, 'Update Failed')
      }
    } catch (error: any) {
      console.error('❌ Role change failed:', error)
      generalToast.error(`Error changing role: ${error.message}`, 'Error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEnableUser = async (userId: string, email: string) => {
    setIsLoading(true)
    try {
      console.log('🔓 Approving user:', email, userId)

      // Update in backend first
      await userManagementService.enableUser(userId)

      console.log('✅ User enabled in backend, updating UI...')

      // CRITICAL: Clear systemUsers cache to ensure fresh data on next login
      localStorage.removeItem('systemUsers')
      console.log('🧹 Cleared systemUsers cache to prevent stale data')

      // Update the UI state directly without reloading
      setUsers(prevUsers => {
        const updated = prevUsers.map(user =>
          user.id === userId
            ? { ...user, isActive: true, isLocked: false }
            : user
        )
        console.log('📊 Updated users state:', {
          total: updated.length,
          pending: updated.filter(u => !u.isActive).length,
          active: updated.filter(u => u.isActive).length
        })
        return updated
      })

      generalToast.success(
        `${email} has been approved and can now log in.`,
        'User Approved'
      )
    } catch (error: any) {
      console.error('❌ Failed to approve user:', error)
      generalToast.error(`Failed to approve user: ${error.message}`, 'Approval Failed')
      // Only reload on error to revert
      await loadUsers()
    } finally {
      setIsLoading(false)
    }
  }

  const pendingUsers = users.filter(u => !u.isActive)
  const activeUsers = users.filter(u => u.isActive)

  console.log('📊 DEBUG: Total users:', users.length)
  console.log('📊 DEBUG: Pending users:', pendingUsers.length, pendingUsers.map(u => u.email))
  console.log('📊 DEBUG: Active users:', activeUsers.length, activeUsers.map(u => u.email))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">User Management</h3>
        <button
          onClick={() => setShowAddUser(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          disabled={isLoading}
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Pending Approvals Section */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">
              Pending Approvals ({pendingUsers.length})
            </h4>
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
            The following users are awaiting activation. Click "Approve" to activate their accounts.
          </p>
          <div className="space-y-2">
            {pendingUsers.map(user => (
              <div key={user.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">{user.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{user.email}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Role: <span className="font-medium">{user.role === 'super_user' ? 'Super User' : 'User'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEnableUser(user.id, user.email)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 text-sm"
                    disabled={isLoading}
                  >
                    <UserCheck className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.email)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1 text-sm"
                    disabled={isLoading}
                  >
                    <UserX className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add User Form */}
      {showAddUser && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-700 max-w-6xl">
          <h4 className="font-medium mb-3 text-lg">Add New User</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
            <input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            >
              <option value="user">User</option>
              <option value="super_user">Super User</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAddUser}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium text-sm"
              disabled={isLoading}
            >
              Create User
            </button>
            <button
              onClick={() => {
                setShowAddUser(false)
                setNewUser({ name: '', email: '', password: '', role: 'user' })
              }}
              className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-700 font-medium text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Users List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
            Active Users ({activeUsers.length})
          </h4>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Role</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Last Login</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeUsers.map((user) => (
              <React.Fragment key={user.id}>
                <tr className="border-b hover:bg-gray-50 dark:bg-gray-700">
                  <td className="px-4 py-3 text-sm">{user.name}</td>
                  <td className="px-4 py-3 text-sm">{user.email}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      user.role === 'super_user' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                      user.role === 'user' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {user.role === 'super_user' ? 'Super User' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    <span className={user.lastLogin ? "" : "text-gray-400"}>
                      {formatLastLogin(user.lastLogin)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {user.isLocked ? (
                      <span className="text-red-600 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    ) : (
                      <span className="text-green-600">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex justify-end gap-2">
                      {/* Role Toggle Button */}
                      {isFirstSuperUser(user) ? (
                        <button
                          className="p-1 text-gray-400 cursor-not-allowed rounded"
                          title="First Super User - Cannot change role"
                          disabled
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleRole(user)}
                          className={`p-1 rounded ${
                            user.role === 'super_user'
                              ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900'
                              : 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900'
                          }`}
                          title={user.role === 'super_user' ? 'Demote to User' : 'Promote to Super User'}
                          disabled={isLoading}
                        >
                          {user.role === 'super_user' ? (
                            <UserIcon className="w-4 h-4" />
                          ) : (
                            <Shield className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => setShowChangePassword(user.id)}
                        className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900 rounded"
                        title="Change Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      {user.isLocked ? (
                        <button
                          onClick={() => handleEnableUser(user.id, user.email)}
                          className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900 rounded"
                          title="Enable Account"
                          disabled={isLoading}
                        >
                          <Unlock className="w-4 h-4" />
                        </button>
                      ) : (
                        // Only show disable button for non-super users and non-demo users
                        !(user.email.toLowerCase() === 'elmfarrell@yahoo.com' ||
                          user.email.toLowerCase() === 'pierre@phaetonai.com' ||
                          user.email.toLowerCase() === 'demo@medex.com' ||
                          user.email.toLowerCase() === 'guest@email.com') && (
                          <button
                            onClick={() => handleDisableUser(user.id, user.email)}
                            className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded"
                            title="Disable Account"
                            disabled={isLoading}
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                        )
                      )}
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {showChangePassword === user.id && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3 bg-purple-50">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">New Password:</span>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="px-3 py-1 border rounded flex-1 max-w-xs"
                          placeholder="Enter new password"
                        />
                        <button
                          onClick={() => handleChangePassword(user.id, user.email)}
                          className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                          disabled={isLoading}
                        >
                          Set Password
                        </button>
                        <button
                          onClick={() => {
                            setShowChangePassword(null)
                            setNewPassword('')
                          }}
                          className="px-3 py-1 bg-gray-50 dark:bg-gray-7000 text-white rounded text-sm hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {activeUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No active users found
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationDialog />
    </div>
  )
}