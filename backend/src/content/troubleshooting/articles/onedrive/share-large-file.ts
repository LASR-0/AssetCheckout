import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ONEDRIVE — HOW DO I SHARE A LARGE FILE WITH SOMEONE?          |
///  +-----------------------------------------------------------------+
//
//  NOT A ONEDRIVE ANSWER, despite sitting under OneDrive. KSB has a file
//  transfer application for this, and the symptom lives here because "sharing
//  files" is where people look — not because OneDrive is the tool.
//
//  THE FIVE-MINUTE WAIT IS THE WHOLE REASON THIS ARTICLE EXISTS. The first
//  sign-in creates a data room named after your email address, and it does not
//  appear immediately. Somebody who signs in, sees nothing they can use and
//  concludes it is broken will go back to trying to email a 2 GB file. The
//  wait is stated in step 1 rather than buried, because that is the moment
//  people give up.
//
//  THE PASSWORD AND THE LINK TRAVEL SEPARATELY, and the article says why in
//  plain terms rather than citing a policy. A password in the same email as
//  the link protects nothing at all — anyone who can read the message has
//  both — and that is worth one sentence to somebody who has never thought
//  about it.
///  +-----------------------------------------------------------------+

const onedriveShareLargeFile: Article = {
  symptomId: "share-large-file",
  subjectKeys: ["onedrive"],
  summary:
    "Email will not carry a large file and OneDrive links do not work for people outside KSB. Use the file transfer site: upload it, put a password on it, and send the link.",
  timeEstimate: "About 10 minutes",
  appliesTo: "Anyone at KSB sending files to someone outside the organisation",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Sign in to the file transfer site",
      body: "Go to https://filetransfer.ksb.com/ and choose the SSO option to sign in, not a username and password. SSO uses the KSB account you are already signed in with, so there is nothing new to remember.",
      note: "The first time you ever sign in; it can take up to five minutes before you can do anything useful. You will get an email saying you have been granted permissions for a data room named after your @ksb.com address; that is your own space on the site, and it has to be created before it will appear. If it looks empty at first, wait for the email rather than assuming it has not worked.",
      figure: {
        images: [
          { src: "onedrive/share-large-file/Filetransfer-sso-light.png" },
        ],
        size: "window",
        caption: "filetransfer.ksb.com, the SSO sign-in option",
      },
    },
    {
      title: "Make a folder for what you are sending",
      body: "Inside your data room, create a folder and give it a name that will mean something to the person receiving it, the customer or project name rather than “stuff” or today's date. Everything you share is shared as a folder, so this is what they will see when they open your link.",
      figure: {
        images: [
          {
            src: "onedrive/share-large-file/Filetransfer-your-dataroom-light.png",
          },
        ],
        size: "full",
        caption: "Your data room, then creating a folder inside it",
      },
    },
    {
      title: "Upload the files into it",
      body: "Open the folder and upload whatever you are sending. There is no need to zip anything first unless you want to; the point of the site is that it handles sizes email will not.",
      figure: {
        images: [
          {
            src: "onedrive/share-large-file/Create-a-folder-then-inside-of-it-Uplo-light.jpg",
          },
        ],
        size: "full",
        caption: "Create a folder then inside of it > Upload",
      },
    },
    {
      title: "Share the folder and set a password",
      body: "Back at the list of folders, find the Share button on the far right of your folder's row. It asks you to set a password before it will do anything else. Choose one that meets the requirements it shows, and it produces a link you can send.",
      note: "The password is on the folder, not on you or on the recipient. Anyone with the link and that password can open it, which is what makes it work for someone with no KSB account.",
      figure: {
        images: [
          { src: "onedrive/share-large-file/Filetransfer-share-light.png" },
        ],
        size: "full",
        caption:
          "The Share button on the folder's row, then the password and link panel",
      },
    },
    {
      title: "Send the link and the password separately",
      body: "Email the person the link. Send them the password another way or alternatively just use the setting send password by text message that exists within the site.",
      note: "if you choose to not use the text message option just send them the password via Teams.",
      warn: "A password in the same email as the link protects nothing. Anyone who can read that message, or is forwarded it, has both halves. Sending them by two different routes is the entire reason the password exists.",
      figure: {
        images: [{ src: "onedrive/share-large-file/Figure-light.jpg" }],
        size: "window",
        caption: "Add a password and generate the link",
      },
    },
    {
      title: "It isn't working? Contact IT",
      body: "Tell them whether you got the data room email after signing in, and whether the problem is uploading or the link itself. Those are handled in different places, and the first one is usually just the five-minute wait.",
      branch: {
        label: "I need them to send a file to me instead",
        targetSymptomId: "receive-large-file",
      },
    },
  ],
};

export default onedriveShareLargeFile;
