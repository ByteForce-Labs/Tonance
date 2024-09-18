const express = require('express');
const router = express.Router();
const taskController = require('../controller/taskController');
const userController = require('../controller/userController');
const stakeController = require('../controller/stakeController');
const leaderboardController = require('../controller/leaderboardController');

// Middleware to check if user is owner (you'll need to implement this)
const isOwner = (req, res, next) => {
  // Implement owner check logic here
};

// Task routes
router.get('/tasks/:username', taskController.getTasksForUser);
router.get('/task/:taskId', taskController.getTaskById);
router.post('/task', taskController.createTask);
router.put('/task/:taskId', taskController.updateTask);
router.delete('/task/:taskId', taskController.deleteTask);
router.post('/tasks/bulk', taskController.createMultipleTasks); // New route for bulk task creation


// User routes
router.post('/register', userController.registerUser);
router.get('/referrals/:userId', userController.getUserReferrals);
router.get('/user/:telegramUserId', userController.getUserDetails);
router.post('/task/complete', userController.completeTask);
router.get('/user/:userId/completed-tasks', userController.getCompletedTasks); // New route for fetching completed tasks
router.post('/users/:telegramUserId/start-earning', userController.startEarning);
router.post('/users/:telegramUserId/claim', userController.claimPoints);
router.put('/users/:telegramUserId/role', userController.setUserRole);
router.get('/stats', userController.getTotalStats);
router.put('/users/:telegramUserId/role', userController.getRoleDetails);



// Leaderboard routes
router.get('/leaderboard', leaderboardController.getLeaderboard);
router.get('/rank/:username', leaderboardController.getUserRank);
router.post('/claim-hourly-points', leaderboardController.claimHourlyPoints);

// New game route
router.post('/play-game', userController.playGame);

router.post('/create', stakeController.createStake);
router.post('/claim', stakeController.claimStake);
router.get('/active/:userId', stakeController.getActiveStakes);
router.get('/claimable/:userId', stakeController.getClaimableStakes);



module.exports = router;