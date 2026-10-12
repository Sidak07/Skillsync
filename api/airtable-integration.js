

require('dotenv').config({ path: '../config/.env' });

const Airtable = require('airtable');

// Initialize Airtable
Airtable.configure({
  endpointUrl: 'https://api.airtable.com',
  apiKey: process.env.AIRTABLE_API_KEY
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

/**
 * Create a new user record
 * @param {Object} userData - User data object
 * @param {string} userData.name - User's full name
 * @param {string} userData.email - User's email
 * @param {string} userData.role - User role (Student/Recruiter)
 * @returns {Promise<Object>} Created user record
 */
async function createUser(userData) {
  try {
    const record = await base(process.env.AIRTABLE_USERS_TABLE).create([
      {
        fields: {
          Name: userData.name,
          Email: userData.email,
          Role: userData.role,
          'Created At': new Date().toISOString()
        }
      }
    ]);
    
    return record[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Find user by email
 * @param {string} email - User's email
 * @returns {Promise<Object|null>} User record or null if not found
 */
async function findUserByEmail(email) {
  try {
    const records = await base(process.env.AIRTABLE_USERS_TABLE)
      .select({
        filterByFormula: `{Email} = "${email}"`
      })
      .firstPage();
    
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error('Error finding user:', error);
    throw error;
  }
}

/**
 * Update user's test scores
 * @param {string} userId - Airtable record ID
 * @param {Object} scores - Test scores object
 * @param {number} scores.aptitude - Aptitude score
 * @param {number} scores.technical - Technical score
 * @param {number} scores.communication - Communication score
 * @returns {Promise<Object>} Updated user record
 */
async function updateUserScores(userId, scores) {
  try {
    const record = await base(process.env.AIRTABLE_USERS_TABLE).update([
      {
        id: userId,
        fields: {
          'Aptitude Score': scores.aptitude,
          'Technical Score': scores.technical,
          'Communication Score': scores.communication,
          'Last Test Date': new Date().toISOString()
        }
      }
    ]);
    
    return record[0];
  } catch (error) {
    console.error('Error updating user scores:', error);
    throw error;
  }
}

/**
 * Create a job posting
 * @param {Object} jobData - Job data object
 * @param {string} jobData.title - Job title
 * @param {string} jobData.company - Company name
 * @param {string} jobData.description - Job description
 * @param {string} jobData.recruiterId - Recruiter's Airtable ID
 * @param {Object} jobData.requirements - Skill requirements
 * @returns {Promise<Object>} Created job record
 */
async function createJob(jobData) {
  try {
    const record = await base(process.env.AIRTABLE_JOBS_TABLE).create([
      {
        fields: {
          Title: jobData.title,
          Company: jobData.company,
          Description: jobData.description,
          'Recruiter ID': jobData.recruiterId,
          'Min Aptitude Score': jobData.requirements.aptitude || 0,
          'Min Technical Score': jobData.requirements.technical || 0,
          'Min Communication Score': jobData.requirements.communication || 0,
          'Posted Date': new Date().toISOString(),
          Status: 'Active'
        }
      }
    ]);
    
    return record[0];
  } catch (error) {
    console.error('Error creating job:', error);
    throw error;
  }
}

/**
 * Get students matching job requirements
 * @param {Object} requirements - Job requirements
 * @param {number} requirements.aptitude - Minimum aptitude score
 * @param {number} requirements.technical - Minimum technical score
 * @param {number} requirements.communication - Minimum communication score
 * @returns {Promise<Array>} Array of matching student records
 */
async function getMatchingStudents(requirements) {
  try {
    const formula = `
      AND(
        {Role} = "Student",
        {Aptitude Score} >= ${requirements.aptitude || 0},
        {Technical Score} >= ${requirements.technical || 0},
        {Communication Score} >= ${requirements.communication || 0}
      )
    `.replace(/\s+/g, ' ').trim();
    
    const records = await base(process.env.AIRTABLE_USERS_TABLE)
      .select({
        filterByFormula: formula,
        sort: [
          {field: 'Aptitude Score', direction: 'desc'},
          {field: 'Technical Score', direction: 'desc'},
          {field: 'Communication Score', direction: 'desc'}
        ]
      })
      .all();
    
    return records;
  } catch (error) {
    console.error('Error getting matching students:', error);
    throw error;
  }
}

/**
 * Get all active job postings
 * @returns {Promise<Array>} Array of active job records
 */
async function getActiveJobs() {
  try {
    const records = await base(process.env.AIRTABLE_JOBS_TABLE)
      .select({
        filterByFormula: `{Status} = "Active"`,
        sort: [{field: 'Posted Date', direction: 'desc'}]
      })
      .all();
    
    return records;
  } catch (error) {
    console.error('Error getting active jobs:', error);
    throw error;
  }
}

// Export functions
module.exports = {
  createUser,
  findUserByEmail,
  updateUserScores,
  createJob,
  getMatchingStudents,
  getActiveJobs
};

// Example usage (uncomment to test)
/*
(async () => {
  // Test creating a user
  const testUser = await createUser({
    name: "John Doe",
    email: "john@example.com",
    role: "Student"
  });
  console.log('Created user:', testUser.id);
  
  // Test updating scores
  const updatedUser = await updateUserScores(testUser.id, {
    aptitude: 85,
    technical: 75,
    communication: 90
  });
  console.log('Updated user scores');
})();
*/