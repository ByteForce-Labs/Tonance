// controllers/leaderboardController.js
const Leaderboard = require('../models/Leaderboard');
const { User, Stake } = require('../models/User');

exports.getLeaderboard = async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};
    if (role) {
      query.role = role;
    }

    // Fetch users and calculate the referral count for sorting
    const users = await User.find(query)
      .populate('referrals', 'username');

    // Sort users by the length of their referrals array in descending order
    users.sort((a, b) => b.referrals.length - a.referrals.length);

    // Initialize arrays to hold classified users
    const promoters = [];
    const influencers = [];
    const ambassadors = [];

    // Rank users and classify them based on rank
    users.forEach((user, index) => {
      const rank = index + 1;
      const referralCount = user.referrals.length;

      let classification = 'User';

      if (rank <= 5000) {
        classification = 'Promoter';
        promoters.push({
          username: user.username,
          role: classification,
          referralCount: referralCount,
          rank: rank,
        });
      } else if (rank <= 20000) {
        classification = 'Influencer';
        influencers.push({
          username: user.username,
          role: classification,
          referralCount: referralCount,
          rank: rank,
        });
      } else if (rank <= 50000) {
        classification = 'Ambassador';
        ambassadors.push({
          username: user.username,
          role: classification,
          referralCount: referralCount,
          rank: rank,
        });
      }
    });

    // Return the leaderboard with separate classifications
    res.json({
      promoters,
      influencers,
      ambassadors
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};



exports.getUserRank = async (req, res) => {
  try {
    const { username } = req.params;
    
    // Find the specific user by username
    const user = await User.findOne({ username }).populate('referrals', 'username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch all users and sort them by referral count in descending order
    const users = await User.find({})
      .populate('referrals', 'username');

    users.sort((a, b) => b.referrals.length - a.referrals.length);

    let rank = 0;
    let classification = 'User';

    // Find the rank of the specific user
    for (let i = 0; i < users.length; i++) {
      if (users[i].username === username) {
        rank = i + 1;
        break;
      }
    }

    // Determine the classification based on rank
    if (rank <= 5000) {
      classification = 'Promoter';
    } else if (rank <= 20000) {
      classification = 'Influencer';
    } else if (rank <= 50000) {
      classification = 'Ambassador';
    }

    // Return the user's rank, referral count, and classification
    res.json({
      username: user.username,
      referralCount: user.referrals.length,
      rank: rank,
      classification: classification,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};



exports.claimHourlyPoints = async (req, res) => {
  try {
    const { telegramUserId } = req.body;
    const user = await User.findOne({ telegramUserId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.canClaim()) {
      const secondsToNextClaim = Math.ceil((60 * 60) - ((Date.now() - user.lastClaimTime) / 1000));
      return res.status(400).json({ 
        message: 'You can\'t claim yet', 
        secondsToNextClaim 
      });
    }

    const claimedAmount = user.claim();
    await user.save();

    res.json({
      message: 'Points claimed successfully',
      claimedAmount,
      newBalance: user.balance,
      claimStreak: user.claimStreak,
      secondsToNextClaim: 10800 // 1 hour until the next claim
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


