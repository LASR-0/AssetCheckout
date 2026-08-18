import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ONEDRIVE — HOW DOES SOMEONE SHARE A LARGE FILE WITH ME?       |
///  +-----------------------------------------------------------------+
//
//  THE MIRROR OF share-large-file, and deliberately a separate article rather
//  than a section of it. The two start identically — sign in, make a folder —
//  and then differ by one button, but a reader arrives with one of the two
//  questions and should not have to read the other one to find their half.
//
//  THE BUTTON IS HIDDEN BEHIND THE "..." MENU, which is the only genuinely
//  hard-to-find thing in either article. Share sits in plain view on the row;
//  Request file does not, and somebody who does not know it exists will send
//  their own share link and wonder why the other person cannot upload to it.
//
//  THE PASSWORD IS OPTIONAL HERE AND THE ARTICLE SAYS SO PLAINLY, then says
//  why to set one anyway. "Recommended" with no reason gets ignored; the
//  reason is that a request link lets anyone holding it put files into YOUR
//  data room, and links get forwarded.
//
//  YOU DO NOT NEED ANYTHING FROM THEM FIRST. No account, no sign-in, nothing
//  installed. That is worth saying early, because the instinct is to ask IT to
//  "give them access" — and there is nothing to give.
///  +-----------------------------------------------------------------+

const onedriveReceiveLargeFile: Article = {
  symptomId: "receive-large-file",
  subjectKeys: ["onedrive"],
  summary:
    "You send them a link and they upload into a folder of yours. A password is optional but worth setting. They need no KSB account and nothing installed, the whole thing works from their browser.",
  timeEstimate: "About 10 minutes",
  appliesTo:
    "Anyone at KSB receiving files from someone outside the organisation",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Sign in to the file transfer site",
      body: "Go to KSB file transfer (link below) and choose the SSO option to sign in, not a username and password. SSO uses the KSB account you are already signed in with, so there is nothing new to remember.",
      note: "The first time you ever sign in; it can take up to five minutes before you can do anything useful. You will get an email saying you have been granted permissions for a data room named after your @ksb.com address; that is your own space on the site, and it has to be created before it will appear. If it looks empty at first, wait for the email rather than assuming it has not worked.",
      figure: {
        images: [
          { src: "onedrive/receive-large-file/Filetransfer-sso-light.png" },
        ],
        size: "window",
        caption: "filetransfer.ksb.com, the SSO sign-in option",
      },
      link: {
        label: "Go to KSB File Transfer",
        url: "https://filetransfer.ksb.com/",
      },
    },
    {
      title: "Make a folder for them to upload into",
      body: "Inside your data room, create an empty folder and name it after whoever is sending, or the job it belongs to. This is where their files will land, so a name you will recognise in a month is worth ten seconds now.",
      figure: {
        images: [
          {
            src: "onedrive/receive-large-file/Filetransfer-your-dataroom-light.png",
          },
        ],
        size: "full",
        caption: "Your data room, then creating a folder inside it",
      },
    },
    {
      title: "Use Request file rather than Share",
      body: "On your folder's row, click the “...” button next to Share and choose Request file. Share sends files out; Request file lets somebody put files in. It opens the same panel, where you can set a password (it is not required here, but we recommend it) and then generate the link.",
      note: "This is the step people miss. Sending your own Share link instead looks similar and will not let them upload anything, which is usually where the confusion starts.",
      warn: "Without a password, anyone who ends up with the link can upload into that folder, a forwarded email, a message in a group chat. It is your data room they are putting files in, so a password is worth the extra minute unless you have a reason not to.",
      figure: {
        images: [
          { src: "onedrive/receive-large-file/Filetransfer-request-light.png" },
        ],
        size: "full",
        caption:
          "The “...” menu next to Share, then the password and link panel",
      },
    },
    {
      title: "Send them the link",
      body: "Email them the link. If you set a password, send it another way, a text message, a phone call, or a separate message on whatever you normally use with them. They open the link in any browser, enter the password if there is one, and upload. They do not need a KSB account, an application, or anything from IT.",
      note: "If you did set one, do not put it in the same email as the link; anyone who can read that message, or is forwarded it, would have both halves, which leaves you no better off than sending no password at all.",
      figure: {
        images: [{ src: "onedrive/receive-large-file/Figure-light.jpg" }],
        size: "window",
        caption:
          "Password is optional for requesting files but we do recommend you use one.",
      },
    },
    {
      title: "Collect the files",
      body: "Once they have uploaded; the files are simply in that folder. Sign back in to the file transfer site and open it; there is no notification to wait for and nothing to accept, so if you agreed a time it is worth just looking.",
    },
    {
      title: "It isn't working? Contact IT",
      body: "Tell them whether you got the data room email after signing in, and whether the person you are expecting files from reported a problem with the link or the password. If they can open the page but not upload; the link was a Share link rather than a Request file one.",
      branch: {
        label: "I need to send a file to them instead",
        targetSymptomId: "share-large-file",
      },
    },
  ],
};

export default onedriveReceiveLargeFile;
