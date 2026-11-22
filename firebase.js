import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
    collection, doc, getDocFromServer, getDocsFromServer, getFirestore, query,
    runTransaction, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import {
    getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBWlSrhkRz5BrpzF08zxMFEorXIQRaqf-k",
    authDomain: "ats-tutoring.firebaseapp.com",
    projectId: "ats-tutoring",
    storageBucket: "ats-tutoring.firebasestorage.app",
    messagingSenderId: "120226633080",
    appId: "1:120226633080:web:3e56cda2d782322fcb248d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: "ats.edu.mx", prompt: "select_account" });

const settingsRef = doc(db, "settings", "review");
let reviewerEmail = "";

function isSchoolUser(user) {
    return Boolean(user?.emailVerified && /^[^@\s]+@ats\.edu\.mx$/i.test(user.email || ""));
}

window.signInWithGoogle = async function () {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google sign-in error:", error);
        alert("Sign-in failed. Please try again.");
    }
};

window.signOutUser = async function () {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign-out error:", error);
        alert("Sign-out failed. Please try again.");
    }
};

onAuthStateChanged(auth, async user => {
    reviewerEmail = "";
    if (!user) {
        window.handleAuthStateChanged(null);
        return;
    }

    const token = await user.getIdTokenResult().catch(() => null);
    if (auth.currentUser !== user) return;

    if (!isSchoolUser(user) || token?.signInProvider !== "google.com") {
        window.handleAuthStateChanged(null);
        await window.signOutUser();
        alert("Please sign in with your ATS school Google account.");
        return;
    }

    try {
        const settings = await getDocFromServer(settingsRef);
        if (auth.currentUser !== user) return;
        reviewerEmail = settings.data()?.reviewerEmail || "";
    } catch (error) {
        console.error("Unable to load reviewer settings:", error);
    }

    if (auth.currentUser === user) window.handleAuthStateChanged(user);
});

window.isAdminUser = function () {
    const user = auth.currentUser;
    return isSchoolUser(user) && user.email.toLowerCase() === reviewerEmail;
};

window.submitTutorApplication = async function (applicationData) {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Sign in with your ATS account first.");

    const applicationRef = doc(db, "tutorApplications", user.uid);
    const mailRef = doc(db, "mail", user.uid);
    const availability = Object.fromEntries(Object.entries(applicationData.availability || {})
        .filter(([, times]) => Array.isArray(times) && times.length > 0));
    if (!Object.keys(availability).length) {
        throw new Error("Select at least one available time.");
    }
    const contactMethod = applicationData.contactMethod || "";
    if (!["", "School email", "Phone number"].includes(contactMethod)) {
        throw new Error("Choose a valid contact method.");
    }
    const contactConsent = Boolean(contactMethod) && (applicationData.contactConsent === true
        || (contactMethod === "School email" && applicationData.shareSchoolEmail === true));
    const contactPhone = contactMethod === "Phone number"
        ? (applicationData.contactPhone || "").trim() : null;
    if (contactMethod && !contactConsent) throw new Error("Confirm that you agree to share your contact details.");
    if (contactMethod === "Phone number" && !/^\+?[0-9]{7,15}$/.test(contactPhone)) {
        throw new Error("Enter a valid phone number.");
    }

    return runTransaction(db, async transaction => {
        const existing = await transaction.get(applicationRef);
        if (existing.exists()) return false;

        const settings = (await transaction.get(settingsRef)).data();
        if (!settings?.reviewerEmail || !settings?.reviewUrl) {
            throw new Error("The application reviewer has not been configured.");
        }

        transaction.set(applicationRef, {
            ...applicationData,
            availability,
            contactMethod,
            contactPhone,
            contactConsent,
            shareSchoolEmail: contactMethod === "School email" && contactConsent,
            userId: user.uid,
            applicantEmail: user.email.toLowerCase(),
            status: "pending",
            subjectStatuses: Object.fromEntries(
                applicationData.subjects.map(subject => [subject, "pending"])
            ),
            createdAt: serverTimestamp()
        });

        transaction.set(mailRef, {
            to: settings.reviewerEmail,
            message: {
                subject: "New ATS tutor application",
                text: "A student submitted a tutor application. Review it here: " + settings.reviewUrl
            }
        });
        return true;
    });
};

async function readDocuments(reference) {
    const snapshot = await getDocsFromServer(reference);
    return snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
}

window.getMyTutorApplications = function () {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Please sign in first.");
    return readDocuments(query(
        collection(db, "tutorApplications"), where("userId", "==", user.uid)
    ));
};

window.getAllTutorApplications = function () {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");
    return readDocuments(collection(db, "tutorApplications"));
};

window.getPendingTutorApplications = function () {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");
    return readDocuments(query(
        collection(db, "tutorApplications"), where("status", "==", "pending")
    ));
};

window.getExistingTutors = function () {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");
    return readDocuments(collection(db, "tutors"));
};

window.getTutorsForSubject = function (subject) {
    return readDocuments(query(
        collection(db, "tutors"), where("subjects", "array-contains", subject)
    ));
};

window.updateTutorApplicationDecision = async function (applicationId, subjectStatuses) {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");

    const reviewer = auth.currentUser.email.toLowerCase();
    const applicationRef = doc(db, "tutorApplications", applicationId);
    const tutorRef = doc(db, "tutors", applicationId);

    await runTransaction(db, async transaction => {
        const application = (await transaction.get(applicationRef)).data();
        if (!application) throw new Error("Application no longer exists.");
        if ((application.status || "pending") !== "pending") {
            throw new Error("This application has already been reviewed. Refresh the dashboard.");
        }

        const subjects = application.subjects;
        if (!subjects.length || Object.keys(subjectStatuses).length !== subjects.length ||
            !subjects.every(subject => ["approved", "rejected"].includes(subjectStatuses[subject]))) {
            throw new Error("Choose a decision for every requested subject.");
        }

        const approved = subjects.filter(subject => subjectStatuses[subject] === "approved");
        let status = "partially_approved";
        if (approved.length === 0) status = "rejected";
        if (approved.length === subjects.length) status = "approved";

        transaction.update(applicationRef, {
            status, subjectStatuses, reviewedBy: reviewer, reviewedAt: serverTimestamp()
        });

        if (approved.length === 0) {
            transaction.delete(tutorRef);
            return;
        }

        transaction.set(tutorRef, {
            firstName: application.firstName,
            lastName: application.lastName,
            grade: application.grade,
            bio: application.bio,
            subjects: approved,
            formats: application.formats,
            rateType: application.rateType,
            hourlyRate: application.hourlyRate ?? null,
            availability: Object.fromEntries(Object.entries(application.availability || {})
                .filter(([, times]) => Array.isArray(times) && times.length > 0)),
            maxStudents: application.maxStudents ?? null,
            contactMethod: application.contactMethod || "",
            contactEmail: application.shareSchoolEmail === true ? application.applicantEmail : null,
            contactPhone: application.contactMethod === "Phone number"
                && application.contactConsent === true
                && /^\+?[0-9]{7,15}$/.test(application.contactPhone || "")
                    ? application.contactPhone : null
        });
    });
};

window.removeExistingTutor = async function (applicationId) {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");

    const applicationRef = doc(db, "tutorApplications", applicationId);
    const tutorRef = doc(db, "tutors", applicationId);
    const reviewer = auth.currentUser.email.toLowerCase();

    return runTransaction(db, async transaction => {
        const application = (await transaction.get(applicationRef)).data();
        if (!application) throw new Error("The tutor's application could not be found.");
        if (application.status === "removed") return false;
        if (!["approved", "partially_approved"].includes(application.status)) {
            throw new Error("This application does not have an active tutor approval.");
        }

        transaction.delete(tutorRef);
        transaction.update(applicationRef, {
            status: "removed",
            removedBy: reviewer,
            removedAt: serverTimestamp()
        });
        return true;
    });
};
