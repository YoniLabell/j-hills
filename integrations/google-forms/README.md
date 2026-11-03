# J-Hills — Google Forms import

New Google Form submissions are processed by Apps Script and sent to the J-Hills backend. The backend creates an INACTIVE apartment (not publicly visible) and uploads photos.

## Setup

1. Review and deploy the GitHub changes, including database migration 0007.
2. In Render Environment, add GOOGLE_FORMS_SECRET with a long new random value.
3. Open your linked response spreadsheet > Extensions > Apps Script.
4. Add the code from Code.gs to the script project.
5. Under Apps Script Project Settings > Script Properties, set JHILLS_API_URL to the public HTTPS API URL and JHILLS_FORMS_SECRET to the same secret set on Render.
6. Run installJHillsTrigger, authorize the permissions and send a NEW test form response.
7. In /admin/apartments verify the apartment is inactive and its images are present. Activate it only after reviewing the description, pricing and photos.

To import the most recent old response, run importLatestJHillsResponse from the script editor. It creates a real inactive draft. To retry a specific response after a failed photo import, call retryJHillsResponse(responseId). Repeat delivery does not create duplicate apartments or duplicate photos.

## Constraints

The script requires owner authorization to read uploaded Google Drive photos. The current photo pipeline accepts JPEG, PNG and WebP up to the configured MAX_UPLOAD_MB (10 MB by default). Convert HEIC images first. For durable Render uploads, Cloudinary must be configured.

Only Form submit triggers an import; editing cells in Google Sheets does not. Question numbers determine field mapping. The English site may show Hebrew text if the owner did not supply English text: review and translate before publishing. Floor and bed breakdown are included in the Hebrew description rather than separate columns. No automatically published listings.

Tests: cd backend && pytest tests/test_google_forms_import.py -q
