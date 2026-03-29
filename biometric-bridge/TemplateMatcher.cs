using DPFP;
using DPFP.Processing;
using DPFP.Verification;

namespace HybridBiometricBridge;

/// <summary>
/// Builds Templates from FeatureSets and performs 1:N matching.
/// </summary>
public static class TemplateMatcher
{
    /// <summary>
    /// Tries to build a Template from accumulated FeatureSets.
    /// Returns (template_base64, is_complete, samples_collected).
    /// </summary>
    public static (string? templateBase64, bool isComplete, int samplesNeeded) TryBuildTemplate(
        Enrollment enrollment)
    {
        try
        {
            var status = enrollment.TemplateStatus;
            if (status == Enrollment.Status.Ready)
            {
                using var ms = new MemoryStream();
                enrollment.Template.Serialize(ms);
                return (Convert.ToBase64String(ms.ToArray()), true, 0);
            }
            // Need more samples
            int needed = enrollment.FeaturesNeeded;
            return (null, false, needed);
        }
        catch
        {
            return (null, false, 1);
        }
    }

    /// <summary>
    /// Compares a scanned FeatureSet against a stored Template (Base64).
    /// Returns true if they match.
    /// </summary>
    public static bool IsMatch(FeatureSet scannedFeatures, string templateBase64)
    {
        try
        {
            var bytes = Convert.FromBase64String(templateBase64);
            var template = new Template();
            using var ms = new MemoryStream(bytes);
            template.DeSerialize(ms);

            var verifier = new Verification();
            var result   = new Verification.Result();
            verifier.Verify(scannedFeatures, template, ref result);
            return result.Verified;
        }
        catch
        {
            return false;
        }
    }
}
