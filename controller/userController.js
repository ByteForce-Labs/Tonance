const { User, Stake } = require('../models/User');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Task = require('../models/Task');

// Helper function for error handling
const handleError = (res, error, statusCode = 500) => {
  console.error('Error:', error);
  res.status(statusCode).json({ message: error.message || 'An error occurred' });
};

// Register a new user
exports.registerUser = async (req, res) => {
  try {
    const { telegramUserId, username, referralCode } = req.body;

    // Input validation
    if (!telegramUserId || !username) {
      return res.status(400).json({ message: 'Telegram User ID and username are required' });
    }

    let referredBy = null;
    if (referralCode) {
      referredBy = await User.findOne({ username: referralCode });
      if (!referredBy) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
    }

    const user = new User({
      telegramUserId,
      username,
      referredBy: referredBy ? referredBy._id : null,
    });
    await user.save();

    if (referredBy) {
      await processReferral(referredBy, user);
    }

    user.addEarnings(30000); // Join bonus
    await user.save();

    res.status(201).json(user);
  } catch (error) {
    handleError(res, error, 400);
  }
};

// Helper function to process referral bonuses
async function processReferral(referrer, newUser) {
  referrer.referrals.push(newUser._id);
  referrer.addEarnings(15000);
  await referrer.save();

  const referralBonuses = [0.20, 0.10, 0.05, 0.025, 0.0125];
  let currentReferrer = referrer;

  for (const bonus of referralBonuses) {
    if (!currentReferrer) break;
    
    const bonusAmount = Math.floor(30000 * bonus);
    currentReferrer.addEarnings(bonusAmount);
    await currentReferrer.save();

    currentReferrer = await User.findById(currentReferrer.referredBy);
  }
}

// Get all referrals for a user
exports.getUserReferrals = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(userId).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.referrals);
  } catch (error) {
    handleError(res, error);
  }
};

// Get user details
exports.getUserDetails = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId }).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.checkAndUpdateRole();
    const currentEarnings = user.isEarning ? user.calculateEarnings() : 0;

    res.json({
      telegramUserId: user.telegramUserId,
      username: user.username,
      role: user.role,
      balance: user.balance,
      currentEarnings,
      isEarning: user.isEarning,
      lastStartTime: user.lastStartTime,
      lastClaimTime: user.lastClaimTime,
      roleExpiryDate: user.roleExpiryDate,
      referralCode: user.username,
      referredBy: user.referredBy,
      referrals: user.referrals.map(ref => ref.username),
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Play game and update user score
exports.playGame = async (req, res) => {
  try {
    const { username, score } = req.body;

    if (!username || typeof score !== 'number') {
      return res.status(400).json({ message: 'Invalid input' });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldBalance = user.balance;
    user.balance += score;
    user.totalEarnings += score;
    user.lastActive = new Date();

    await user.save();

    res.status(200).json({
      message: 'Game score added to balance successfully',
      newHighScore: user.balance > oldBalance,
      scoreAdded: score,
      newBalance: user.balance,
      previousBalance: oldBalance
    });
  } catch (error) {
    handleError(res, error);
  }
};


exports.getRoleDetails = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const { role, durationInDays } = req.body;

    // Input validation
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    // Find the user
    const user = await User.findOne({ telegramUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's role
    user.setRole(role, durationInDays);
    await user.save();

    // Prepare the response
    const response = {
      message: 'User role updated successfully',
      user: {
        telegramUserId: user.telegramUserId,
        username: user.username,
        role: user.role,
        roleExpiryDate: user.roleExpiryDate
      }
    };

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};




// Complete a task
exports.completeTask = async (req, res) => {
  try {
    const { username, taskId } = req.body;

    if (!username || !taskId) {
      return res.status(400).json({ message: 'Username and taskId are required' });
    }

    const [user, task] = await Promise.all([
      User.findOne({ username }),
      Task.findById(taskId)
    ]);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (user.tasksCompleted.includes(taskId)) {
      return res.status(400).json({ message: 'Task already completed' });
    }

    user.tasksCompleted.push(taskId);
    user.addEarnings(task.points);

    if (user.tasks) {
      user.tasks = user.tasks.filter(t => t.toString() !== taskId);
    }

    await user.save();

    res.status(200).json({ message: 'Task completed successfully', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Get completed tasks
exports.getCompletedTasks = async (req, res) => {
  try {
    const { userId } = req.params;
    let user;

    if (ObjectId.isValid(userId)) {
      user = await User.findById(userId).populate('tasksCompleted');
    } else {
      user = await User.findOne({ telegramUserId: userId }).populate('tasksCompleted');
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.tasksCompleted);
  } catch (error) {
    handleError(res, error);
  }
};

// Start earning points
exports.startEarning = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.isEarning) {
      return res.status(400).json({ message: 'User is already earning points' });
    }
    
    if (!user.canStartEarning()) {
      return res.status(400).json({ message: 'User cannot start earning right now.' });
    }
    
    user.startEarning();
    user.lastActive = new Date();
    await user.save();
    
    res.status(200).json({ message: 'Started earning points', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Claim earned points
exports.claimPoints = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const user = await User.findOne({ telegramUserId });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.checkAndUpdateRole();
    const claimedAmount = user.claim();
    
    if (claimedAmount > 0) {
      user.lastActive = new Date();
      await user.save();
      
      res.status(200).json({
        message: 'Points claimed successfully',
        claimedAmount,
        newBalance: user.balance,
        isEarning: user.isEarning
      });
    } else {
      res.status(400).json({ message: 'No points available to claim' });
    }
  } catch (error) {
    handleError(res, error);
  }
};

// Set user role
exports.setUserRole = async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    const { role, durationInDays } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const user = await User.findOne({ telegramUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.setRole(role, durationInDays);
    await user.save();

    res.status(200).json({ message: 'User role updated successfully', user });
  } catch (error) {
    handleError(res, error);
  }
};

// Get total stats
exports.getTotalStats = async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    const [totalStats, dailyUsers, onlineUsers] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalMined: { $sum: '$totalEarnings' }
          }
        }
      ]),
      User.countDocuments({ lastClaimTime: { $gte: oneDayAgo } }),
      User.countDocuments({ lastActive: { $gte: oneHourAgo } })
    ]);

    const stats = totalStats[0] || { totalUsers: 0, totalMined: 0 };

    res.status(200).json({
      totalUsers: stats.totalUsers,
      totalMined: stats.totalMined,
      dailyUsers,
      onlineUsers
    });
  } catch (error) {
    handleError(res, error);
  }
};