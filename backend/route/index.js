const express = require('express');
const router = express.Router();
const obsRoutes = require('./obsRoutes');

// all routes go here
router.use('/obs', obsRoutes);

module.exports = router;