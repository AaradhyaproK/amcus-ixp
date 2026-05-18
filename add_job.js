// Helper script to automatically register a new job description inside InterviewXpert
// Run this file using: node add_job.js

async function addJob() {
  const url = 'http://localhost:8080/api/jobs/receive';
  const apiKey = 'ix_live_test_api_key_123456789';

  const payload = {
    title: "Senior Node.js Developer", // 👈 Edit the Title
    description: "Build ultra-fast backend APIs...", // 👈 Edit the Description
    department: "Backend Engineering",
    employmentType: "Full-time",
    experience: 4,
    skills: "Node.js, Express, Postgres",
    education: "B.Tech / MCA",
    numQuestions: 5,
    difficulty: "Medium",
    strictness: "Medium",
    candidateEmails: [""],
    recruiterUID: "i6EJOnXQ0KOvIrt6LQyWUlKIkom1" // 👈 Add the recruiter's Firebase User UID here to link to their login!
  };


  console.log('Sending request to InterviewXpert API server...');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('\n--- API RESPONSE ---');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ Job successfully scheduled!');
      console.log(`🔗 Interview Link: ${result.data.interviewLink}`);
      console.log(`🔑 Access Code: ${result.data.accessCode}`);
    } else {
      console.log('\n❌ Failed to add job:', result.error);
    }
  } catch (error) {
    console.error('\n❌ Connection Error: Could not connect to API server. Make sure "node api-server/server.js" is running on port 8080.');
    console.error(error.message);
  }
}

addJob();
