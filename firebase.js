import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
    collection, doc, getDocFromServer, getDocsFromServer, getFirestore, query,
    runTransaction, serverTimestamp, where, Timestamp, onSnapshot
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
let googlePhotoURL = null;

function validGooglePhotoURL(value) {
    return typeof value === "string" && value.length <= 2048
        && /^https:\/\/lh[0-9]+[.]googleusercontent[.]com\/[^\s]+$/.test(value);
}

window.getGoogleProfilePhoto = () => googlePhotoURL;

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
    googlePhotoURL = null;
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
    if (validGooglePhotoURL(token.claims?.picture)) googlePhotoURL = token.claims.picture;

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

window.submitTutorApplication = async function (applicationData, editingId = null) {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Sign in with your ATS account first.");

    const applicationRef = doc(db, "tutorApplications", editingId || user.uid);
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
    const profilePhotoURL = applicationData.profilePhotoURL
        ? window.getGoogleProfilePhoto() : null;
    if (applicationData.profilePhotoURL && !profilePhotoURL) {
        throw new Error("Your Google profile photo is unavailable. Continue using your initials.");
    }

    return runTransaction(db, async transaction => {
        const existing = await transaction.get(applicationRef);
        if (editingId) {
            if (!existing.exists() || existing.data().userId !== user.uid) throw new Error("You can only edit your own profile.");
            if (existing.data().status === "removed") throw new Error("Please contact the school reviewer before reapplying.");
        } else if (existing.exists()) return false;

        const settings = (await transaction.get(settingsRef)).data();
        if (!settings?.reviewerEmail || !settings?.reviewUrl) {
            throw new Error("The application reviewer has not been configured.");
        }

        const approvedEdit = editingId && ["approved", "partially_approved"].includes(existing.data().status);
        const nextApplication = {
            ...(editingId ? existing.data() : {}),
            ...applicationData,
            availability,
            contactMethod,
            contactPhone,
            contactConsent,
            profilePhotoURL,
            shareSchoolEmail: contactMethod === "School email" && contactConsent,
            userId: user.uid,
            applicantEmail: user.email.toLowerCase(),
            status: approvedEdit ? "approved" : "pending",
            subjectStatuses: Object.fromEntries(
                applicationData.subjects.map(subject => [subject, approvedEdit ? "approved" : "pending"])
            ),
            createdAt: editingId ? existing.data().createdAt : serverTimestamp(),
            ...(editingId ? {updatedAt: serverTimestamp()} : {})
        };
        transaction.set(applicationRef, nextApplication);
        if (approvedEdit) {
            const {userId, firstName, lastName, grade, bio, subjects, formats, rateType, hourlyRate, availability, maxStudents, profilePhotoURL} = nextApplication;
            transaction.set(doc(db, "tutors", editingId), {userId, firstName, lastName, grade, bio, subjects, formats, rateType, hourlyRate: hourlyRate ?? null, availability, maxStudents, profilePhotoURL});
            return true;
        }
        if (editingId) {
            transaction.delete(doc(db, "tutors", editingId));
            transaction.set(doc(db, "profileEdits", user.uid), {applicationId: editingId, updatedAt: serverTimestamp()});
        }

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

const legacySubjectNames = {
    "Chemistry": "Chemistry I & II",
    "Biology": "Biology I & II",
    "Physics": "Physics I & II",
    "Physical Science": "Physical Science I & II",
    "World History": "World History I & II",
    "Civismo": "Civismo de México",
    "U.S. History": "United States History I & II",
    "Expresión Oral": "Expresión Oral I & II",
    "Lectura y Redacción": "Taller de Lectura y Redacción I & II",
    "Literatura": "Literatura I & II",
    "Algebra": "Algebra I & II",
    "Calculus": "Calculus I & II",
    "AP English Language and Composition": "AP English Language & Composition",
    "AP English Literature": "AP English Literature & Composition",
    "AP Precalculus": "AP Pre Calculus",
    "AP Calculus": "AP Calculus AB",
    "American Literature": "American Literature I & II",
    "Writing & Style": "Writing & Style I & II",
    "SAT": "SAT Prep",
    "PAA (Tec, UDEM, etc.)": "PAA (Examen de admisión)"
};
window.getTutorsForSubject = function (subject) {
    return readDocuments(query(
        collection(db, "tutors"), where("subjects", "array-contains-any", [subject, ...Object.keys(legacySubjectNames).filter(key => legacySubjectNames[key] === subject)])
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
            userId: application.userId,
            firstName: application.firstName,
            lastName: application.lastName,
            grade: application.grade,
            bio: application.bio,
            profilePhotoURL: validGooglePhotoURL(application.profilePhotoURL)
                ? application.profilePhotoURL : null,
            subjects: approved,
            formats: application.formats,
            rateType: application.rateType,
            hourlyRate: application.hourlyRate ?? null,
            availability: Object.fromEntries(Object.entries(application.availability || {})
                .filter(([, times]) => Array.isArray(times) && times.length > 0)),
            maxStudents: application.maxStudents ?? null,

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

// Profile contacts stay in the private application; they are copied only to an accepted request.
window.prepareSchedulingProfiles = async function () {
    if (!window.isAdminUser()) throw new Error("Administrator access required.");
    const tutors = await readDocuments(collection(db, "tutors"));
    for (const tutor of tutors) {
        if (tutor.userId && !('contactEmail' in tutor) && !('contactPhone' in tutor)) continue;
        await runTransaction(db, async transaction => {
            const ref = doc(db, "tutors", tutor.id);
            const current = (await transaction.get(ref)).data();
            const application = (await transaction.get(doc(db, "tutorApplications", tutor.id))).data();
            if (!current) return;
            if (!application?.userId || !["approved", "partially_approved"].includes(application.status)) {
                throw new Error("A legacy tutor needs the reviewer to verify their account before scheduling.");
            }
            const {contactMethod, contactEmail, contactPhone, id, ...publicProfile} = current;
            transaction.set(ref, {...publicProfile, userId: application.userId});
        });
    }
};

const schoolDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
window.makeSchoolSlot = function (date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a date.");
    const match = /^(\d{1,2}):00 (AM|PM)$/.exec(time);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) throw new Error("Choose an available time.");
    const hour = Number(match[1]) % 12 + (match[2] === "PM" ? 12 : 0);
    // Tampico school time is UTC−06:00; dates never depend on the visitor's device zone.
    const start = new Date(date + "T" + String(hour).padStart(2, "0") + ":00:00-06:00");
    if (!Number.isFinite(start.getTime())) throw new Error("Choose a valid date.");
    const local = new Date(start.getTime() - 6 * 3600000);
    if (local.toISOString().slice(0,10) !== date) throw new Error("Choose a valid date.");
    return {start, day: schoolDays[local.getUTCDay()], time};
};

window.requestTutoringSession = async function ({tutorId, date, time, subject, format, topic}) {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Sign in with your ATS account first.");
    const {start, day} = window.makeSchoolSlot(date, time);
    if (start <= new Date() || start.getTime() > Date.now() + 60 * 86400000) throw new Error("Choose a future date within 60 days.");
    topic = (topic || "").trim();
    if (topic.length < 10 || topic.length > 500) throw new Error("Describe what you need help with in 10–500 characters.");
    const id = tutorId + "_" + start.getTime() + "_" + user.uid;
    return runTransaction(db, async transaction => {
        const tutor = (await transaction.get(doc(db, "tutors", tutorId))).data();
        const ref = doc(db, "sessionRequests", id);
        const previous = await transaction.get(ref);
        if (!tutor?.userId) throw new Error("This tutor is not ready for scheduling yet.");
        if (tutor.userId === user.uid) throw new Error("You cannot request a session with yourself.");
        if (!tutor.subjects.includes(subject) || !tutor.formats.includes(format) || !tutor.availability?.[day]?.includes(time)) {
            throw new Error("The tutor's availability changed. Please reopen their profile.");
        }
        if (previous.exists()) throw new Error("You already requested this time. Check My sessions or choose another time.");
        transaction.set(ref, {
            tutorId, tutorUid: tutor.userId, studentUid: user.uid,
            studentName: (user.displayName || user.email.split("@")[0]).slice(0,120),
            studentEmail: user.email.toLowerCase(),
            tutorName: tutor.firstName + " " + tutor.lastName,
            subject, format, topic, startAt: Timestamp.fromDate(start),
            status: "pending", meetingDetails: "", tutorContactEmail: null, tutorContactPhone: null,
            rateType: tutor.rateType, hourlyRate: tutor.hourlyRate ?? null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        return id;
    });
};

window.watchMySessions = function (onChange, onError) {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Please sign in first.");
    const lists = [[], []];
    const unsubscribes = ["studentUid", "tutorUid"].map((field, index) =>
        onSnapshot(query(collection(db, "sessionRequests"), where(field, "==", user.uid)), snapshot => {
            lists[index] = snapshot.docs.map(document => ({...document.data(), id: document.id}));
            onChange([...new Map(lists.flat().map(item => [item.id, item])).values()]);
        }, onError)
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
};

window.decideSessionRequest = async function (id, decision, meetingDetails = "") {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Please sign in first.");
    if (!["accepted", "declined", "cancelled"].includes(decision)) throw new Error("Invalid session decision.");
    meetingDetails = meetingDetails.trim();
    return runTransaction(db, async transaction => {
        const ref = doc(db, "sessionRequests", id);
        const session = (await transaction.get(ref)).data();
        if (!session || ![session.tutorUid, session.studentUid].includes(user.uid)) throw new Error("This session is not yours.");
        if (session.startAt.toMillis() <= Date.now()) throw new Error("This session time has already passed.");
        if (!["pending", "accepted"].includes(session.status)) throw new Error("This request has already been closed.");
        const lockRef = doc(db, "scheduleLocks", session.tutorUid + "_" + session.startAt.toMillis());
        const studentLockRef = doc(db, "scheduleLocks", session.studentUid + "_" + session.startAt.toMillis());
        if (decision === "cancelled") {
            if (session.status === "accepted") { transaction.delete(lockRef); transaction.delete(studentLockRef); }
            transaction.update(ref, {status: decision, updatedAt: serverTimestamp(), tutorContactEmail: null, tutorContactPhone: null});
            return;
        }
        if (user.uid !== session.tutorUid || session.status !== "pending") throw new Error("Only the tutor can accept or decline a pending request.");
        if (decision === "declined") {
            transaction.update(ref, {status: decision, updatedAt: serverTimestamp()});
            return;
        }
        const tutor = (await transaction.get(doc(db, "tutors", session.tutorId))).data();
        const application = (await transaction.get(doc(db, "tutorApplications", session.tutorId))).data();
        const lock = await transaction.get(lockRef);
        const studentLock = await transaction.get(studentLockRef);
        if (lock.exists() || studentLock.exists()) throw new Error("You or the student already has a confirmed session at this time. Decline this request or agree on another time.");
        const local = new Date(session.startAt.toMillis() - 6 * 3600000);
        const hour = local.getUTCHours();
        const time = (hour % 12 || 12) + ":00 " + (hour >= 12 ? "PM" : "AM");
        if (tutor?.userId !== user.uid || !tutor.subjects.includes(session.subject)
            || !tutor.formats.includes(session.format) || !tutor.availability?.[schoolDays[local.getUTCDay()]]?.includes(time)) {
            throw new Error("Your profile or availability changed. You cannot accept this request.");
        }
        if (meetingDetails.length < 5 || meetingDetails.length > 250) throw new Error("Add meeting details in 5–250 characters before accepting.");
        const email = application.shareSchoolEmail === true ? application.applicantEmail : null;
        const phone = application.contactMethod === "Phone number" && application.contactConsent === true ? application.contactPhone : null;
        transaction.set(lockRef, {requestId: id, tutorUid: user.uid, ownerUid: session.tutorUid, startAt: session.startAt});
        transaction.set(studentLockRef, {requestId: id, tutorUid: user.uid, ownerUid: session.studentUid, startAt: session.startAt});
        transaction.update(ref, {status: decision, meetingDetails, tutorContactEmail: email, tutorContactPhone: phone, updatedAt: serverTimestamp()});
    });
};

// Reports contain no identity fields; a private counter links the latest submission for spam control.
window.submitHelpReport = async function (category, message) {
    const user = auth.currentUser;
    if (!isSchoolUser(user)) throw new Error("Sign in with your ATS school account to send a report.");
    message = (message || "").trim();
    if (!["Website problem", "Tutoring concern", "Suggestion", "General help"].includes(category)) throw new Error("Choose a report category.");
    if (message.length < 10 || message.length > 2000) throw new Error("Write a message between 10 and 2,000 characters.");
    const limitRef = doc(db, "supportLimits", user.uid);
    const reportRef = doc(collection(db, "supportReports"));
    const day = Timestamp.fromDate(new Date(Math.floor(Date.now() / 86400000) * 86400000));
    return runTransaction(db, async transaction => {
        const previous = (await transaction.get(limitRef)).data();
        const count = previous?.day?.toMillis() === day.toMillis() ? previous.count : 0;
        if (count >= 3) throw new Error("You’ve reached today’s 3-report limit. Please try again tomorrow.");
        transaction.set(limitRef, {day, count: count + 1, reportId: reportRef.id});
        transaction.set(reportRef, {category, message, createdAt: serverTimestamp()});
    });
};
