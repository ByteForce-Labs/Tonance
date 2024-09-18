const mongoose = require('mongoose');

// Define StakeSchema
const StakeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  period: {
    type: Number,
    required: true
  },
  interestRate: {
    type: Number,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  claimed: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  telegramUserId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    enum: ['User', 'MonthlyBooster', 'LifeTimeBooster', 'Monthly3xBooster', 'LifeTime6xBooster'],
    default: 'User',
  },
  balance: {
    type: Number,
    default: 0,
  },
  lastClaimTime: {
    type: Date,
    default: null,
  },
  lastStartTime: {
    type: Date,
    default: null,
  },
  roleExpiryDate: {
    type: Date,
    default: null,
  },
  isEarning: {
    type: Boolean,
    default: false,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  referrals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  joinBonus: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  gameScore: {
    type: Number,
    default: 0,
  },
  tasksCompleted: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
  }],
  stakes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stake',
  }],
  lastActive: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// New static method to find a user by telegramUserId
UserSchema.statics.findByTelegramUserId = function(telegramUserId) {
  return this.findOne({ telegramUserId: telegramUserId });
};

UserSchema.methods.startEarning = function() {
  if (!this.isEarning) {
    this.isEarning = true;
    this.lastStartTime = new Date();
    return true;
  }
  return false;
};

UserSchema.methods.stopEarning = function() {
  if (this.isEarning) {
    this.isEarning = false;
    return true;
  }
  return false;
};

UserSchema.methods.calculateEarnings = function() {
  if (!this.lastStartTime || !this.isEarning) {
    return 0;
  }
  
  const now = new Date();
  const hoursSinceStart = (now - this.lastStartTime) / (1000 * 60 * 60);
  let baseEarnings = 10800 * hoursSinceStart; // Calculate earnings based on exact time

  switch (this.role) {
    case 'MonthlyBooster':
    case 'LifeTimeBooster':
      return Math.floor(baseEarnings);
    case 'Monthly3xBooster':
      return Math.floor(baseEarnings * 3);
    case 'LifeTime6xBooster':
      return Math.floor(baseEarnings * 6);
    case 'User':
      return Math.min(Math.floor(baseEarnings), 10800); // Cap at 10800 for User role
    default:
      return 0;
  }
};

UserSchema.methods.claim = function() {
  const earnings = this.calculateEarnings();
  if (earnings > 0) {
    this.addEarnings(earnings);
    this.lastClaimTime = new Date();
    this.stopEarning(); // Stop earning for all roles after claiming
    this.lastStartTime = null; // Reset lastStartTime
    return earnings;
  }
  return 0;
};

UserSchema.methods.addEarnings = function(amount) {
  this.balance += amount;
  this.totalEarnings += amount;
};

UserSchema.methods.setRole = function(role, durationInDays = null) {
  this.role = role;
  if (durationInDays) {
    this.roleExpiryDate = new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000);
  } else if (role.includes('LifeTime')) {
    this.roleExpiryDate = null;
  }
};

UserSchema.methods.checkAndUpdateRole = function() {
  if (this.roleExpiryDate && this.roleExpiryDate <= new Date()) {
    this.role = 'User';
    this.roleExpiryDate = null;
    this.stopEarning(); // Stop earning when role changes to User
  }
};

UserSchema.methods.canStartEarning = function() {
  // All roles can start earning at any time if they're not already earning
  return !this.isEarning;
};

UserSchema.methods.stake = async function(amount, period) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance for staking');
  }

  let interestRate;
  switch (period) {
    case 3:
      interestRate = 0.03;
      break;
    case 15:
      interestRate = 0.10;
      break;
    case 45:
      interestRate = 0.35;
      break;
    default:
      throw new Error('Invalid staking period');
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + period);

  const stake = new Stake({
    user: this._id,
    amount,
    period,
    interestRate,
    endDate
  });

  await stake.save();
  
  this.stakes.push(stake._id);
  this.balance -= amount; // Deduct staked amount from balance
  await this.save();

  return stake;
};

UserSchema.methods.claimStake = async function(stakeId) {
  const stake = await Stake.findById(stakeId);
  
  if (!stake || !this.stakes.includes(stakeId)) {
    throw new Error('Stake not found or does not belong to this user');
  }

  if (stake.claimed) {
    throw new Error('Stake has already been claimed');
  }

  if (new Date() < stake.endDate) {
    throw new Error('Staking period has not ended yet');
  }

  const interest = stake.amount * stake.interestRate;
  const totalAmount = stake.amount + interest;

  this.balance += totalAmount;
  stake.claimed = true;

  this.stakes = this.stakes.filter(id => id.toString() !== stakeId.toString());

  await stake.save();
  await this.save();

  return totalAmount;
};

UserSchema.methods.getActiveStakes = async function() {
  return Stake.find({
    _id: { $in: this.stakes },
    claimed: false,
    endDate: { $gt: new Date() }
  });
};

UserSchema.methods.getClaimableStakes = async function() {
  return Stake.find({
    _id: { $in: this.stakes },
    claimed: false,
    endDate: { $lte: new Date() }
  });
};

const User = mongoose.model('User', UserSchema);
const Stake = mongoose.model('Stake', StakeSchema);

module.exports = { User, Stake };