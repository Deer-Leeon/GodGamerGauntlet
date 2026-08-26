using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

public static class RunMoments
{
    public static IReadOnlyList<string> For(
        RunStatus status,
        RunType runType,
        int slotsCompleted,
        int totalSlots,
        bool isPersonalBest,
        bool isFirstClear)
    {
        var moments = new List<string>();
        if (isPersonalBest) moments.Add("New PB");
        if (isFirstClear)
        {
            moments.Add(runType == RunType.Lite ? "First Lite Clear" : "First Standard Clear");
        }

        if (status == RunStatus.Failed)
        {
            var stoppedOn = Math.Min(slotsCompleted + 1, totalSlots);
            moments.Add($"Died on game {stoppedOn}");
            if (runType == RunType.Standard && slotsCompleted >= 7)
            {
                moments.Add("Deep DNF");
            }
        }

        return moments;
    }

    public static string RecapTitle(
        RunStatus status,
        RunType runType,
        int slotsCompleted,
        int totalSlots,
        bool isPersonalBest,
        int? boardRank,
        int? wouldBeRank)
    {
        var mode = runType == RunType.Lite ? "Lite" : "Standard";
        if (status == RunStatus.Failed)
        {
            var stoppedOn = Math.Min(slotsCompleted + 1, totalSlots);
            return $"{mode} DNF · stopped on game {stoppedOn} of {totalSlots}";
        }

        if (isPersonalBest && boardRank is int rank)
        {
            return $"{mode} Clear · #{rank}";
        }

        if (wouldBeRank is int would)
        {
            return $"{mode} Clear · would #{would}";
        }

        return $"{mode} Clear";
    }
}
